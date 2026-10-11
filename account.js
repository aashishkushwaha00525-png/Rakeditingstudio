import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const el = (id) => document.getElementById(id);
const setupNotice = el("accountSetupNotice");
const statusEl = el("accountStatus");
const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) &&
  !SUPABASE_URL.includes("YOUR-PROJECT-REF") &&
  SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_");
let supabase = null;
let currentUser = null;

function message(text, bad = false) {
  statusEl.textContent = text;
  statusEl.style.borderColor = bad ? "#7a3838" : "#3a3a3a";
}
function memberMessage(text) { el("memberResults").textContent = text; }
function showSession(user) {
  currentUser = user || null;
  el("authForms").classList.toggle("hidden", !!user);
  el("signedInPanel").classList.toggle("hidden", !user);
  if (user) {
    el("accountEmail").textContent = user.email || "Signed-in customer";
    message("Signed in successfully.");
  } else {
    el("accountEmail").textContent = "";
    el("ownerDashboard").classList.add("hidden");
    message("You are not signed in.");
  }
}
function getVisitorId() {
  const key = "rakStudioVisitorIdV1";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    localStorage.setItem(key, id);
  }
  return id;
}
async function recordVisit() {
  if (!supabase) return;
  try {
    await supabase.rpc("record_site_visit", {
      p_visitor_id: getVisitorId(),
      p_page_path: location.pathname + location.hash
    });
  } catch (e) {
    console.warn("Visit tracking is not configured yet.", e);
  }
}
async function recordLogin(user) {
  if (!supabase || !user) return;
  try { await supabase.rpc("record_login_event"); }
  catch (e) { console.warn("Login event recording failed.", e); }
}
async function refreshDashboard() {
  if (!supabase || !currentUser) return;
  const box = el("dashboardMetrics");
  box.textContent = "Loading statistics…";
  const { data, error } = await supabase.rpc("get_studio_dashboard_stats");
  if (error) {
    box.textContent = "Dashboard access is not enabled for this account. The owner account must be added to studio_admins.";
    return;
  }
  const stats = Array.isArray(data) ? data[0] : data;
  if (!stats) { box.textContent = "No statistics returned yet."; return; }
  const metrics = [
    ["Total visits", stats.total_visits ?? 0],
    ["Approx. unique visitors (30d)", stats.unique_visitors_30d ?? 0],
    ["Registered accounts", stats.registered_accounts ?? 0],
    ["Recent logins (30d)", stats.logins_30d ?? 0],
    ["Total orders", stats.total_orders ?? 0],
    ["Pending orders", stats.pending_orders ?? 0]
  ];
  box.innerHTML = metrics.map(([label, value]) => '<div class="metric"><strong>' + Number(value).toLocaleString() + '</strong><span>' + label + '</span></div>').join("");
}
async function init() {
  if (!configured) {
    setupNotice.classList.remove("hidden");
    for (const id of ["signUpForm", "signInForm"]) {
      const form = el(id);
      form.querySelectorAll("input,button").forEach((node) => node.disabled = true);
    }
    message("Backend setup required. Sign-in is disabled until Supabase is configured.");
    return;
  }
  setupNotice.classList.add("hidden");
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await recordVisit();
  const { data: { session } } = await supabase.auth.getSession();
  showSession(session?.user || null);
  supabase.auth.onAuthStateChange(async (event, sessionNow) => {
    showSession(sessionNow?.user || null);
    if (event === "SIGNED_IN" && sessionNow?.user) await recordLogin(sessionNow.user);
    if (sessionNow?.user) {
      const { data: adminFlag } = await supabase.rpc("is_studio_admin");
      el("ownerDashboard").classList.toggle("hidden", adminFlag !== true);
    }
  });
}
el("signUpForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!supabase) return;
  const email = el("signupEmail").value.trim();
  const password = el("signupPassword").value;
  const display_name = el("signupName").value.trim();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name }, emailRedirectTo: location.origin + location.pathname } });
  if (error) return message(error.message, true);
  message(data.session ? "Account created and signed in." : "Account created. Check your email to confirm it, then sign in.");
});
el("signInForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithPassword({ email: el("signinEmail").value.trim(), password: el("signinPassword").value });
  if (error) message(error.message, true);
});
el("resetPasswordBtn").addEventListener("click", async () => {
  if (!supabase) return;
  const email = el("signinEmail").value.trim();
  if (!email) return message("Pehle sign-in wale box mein apna email likho.", true);
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  message(error ? error.message : "If the email is registered, a password-reset link will arrive shortly.", !!error);
});
el("signOutBtn").addEventListener("click", async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) message(error.message, true);
});
el("refreshDashboardBtn").addEventListener("click", refreshDashboard);
el("loadSavedPromptsBtn").addEventListener("click", async () => {
  if (!supabase || !currentUser) return;
  const { data, error } = await supabase.from("saved_prompts").select("id,title,prompt_text,created_at").order("created_at", { ascending: false }).limit(50);
  if (error) return memberMessage(error.message);
  memberMessage(data.length ? data.map((p) => p.title + "\n" + p.prompt_text).join("\n\n---\n\n") : "Abhi koi saved prompt nahi hai.");
});
el("saveCurrentPromptBtn").addEventListener("click", async () => {
  if (!supabase || !currentUser) return;
  const photo = document.getElementById("photoPromptOutput")?.textContent?.trim();
  const video = document.getElementById("videoPromptOutput")?.textContent?.trim();
  const prompt_text = [photo, video].filter((x) => x && x.length > 10).join("\n\n---\n\n");
  if (!prompt_text) return memberMessage("Pehle Photo Prompt Maker ya Video Prompt Maker se prompt banao.");
  const { error } = await supabase.from("saved_prompts").insert({ user_id: currentUser.id, title: "Saved AI prompt", prompt_text });
  memberMessage(error ? error.message : "Prompt aapke account mein save ho gaya.");
});
el("loadMyOrdersBtn").addEventListener("click", async () => {
  if (!supabase || !currentUser) return;
  const { data, error } = await supabase.from("customer_orders").select("id,order_type,details,status,created_at").order("created_at", { ascending: false }).limit(50);
  if (error) return memberMessage(error.message);
  memberMessage(data.length ? data.map((o) => o.order_type + " — " + o.status + "\n" + o.details + "\n" + new Date(o.created_at).toLocaleString()).join("\n\n") : "Abhi aapke account se koi order nahi juda hai. Existing WhatsApp enquiries automatically import nahi hote.");
});
init();
