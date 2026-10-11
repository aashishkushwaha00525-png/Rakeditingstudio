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
    id = (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function")
      ? globalThis.crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
        });
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
    ["Total recorded visits", stats.visits_total ?? 0],
    ["Approx. unique visitors (30d)", stats.unique_visitors_30d ?? 0],
    ["Registered accounts", stats.registered_customers ?? 0],
    ["Users logged in (30d)", stats.logged_in_users_30d ?? 0],
    ["Total orders", stats.orders_total ?? 0],
    ["Pending orders", stats.orders_pending ?? 0]
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
  if (session?.user) {
    const { data: adminFlag } = await supabase.rpc("is_studio_admin");
    el("ownerDashboard").classList.toggle("hidden", adminFlag !== true);
  }
  supabase.auth.onAuthStateChange((event, sessionNow) => {
    // Keep the auth callback synchronous; do database work after Supabase releases its auth lock.
    showSession(sessionNow?.user || null);
    if (event === "SIGNED_IN" && sessionNow?.user) {
      queueMicrotask(async () => {
        await recordLogin(sessionNow.user);
        const { data: adminFlag } = await supabase.rpc("is_studio_admin");
        el("ownerDashboard").classList.toggle("hidden", adminFlag !== true);
      });
    }
    if (event === "SIGNED_OUT") el("ownerDashboard").classList.add("hidden");
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
el("loadAdvancedToolsBtn").addEventListener("click", async () => {
  const toolsBox = el("memberTools");
  if (!supabase || !currentUser) { toolsBox.textContent = "Sign in to view member tools."; return; }
  toolsBox.textContent = "Loading member tools…";
  const { data, error } = await supabase.from("advanced_tools").select("title,description,url").order("created_at", { ascending: false }).limit(50);
  if (error) { toolsBox.textContent = "Member tools are not available yet. Check the database setup."; return; }
  if (!data?.length) { toolsBox.textContent = "No member-only tools have been added yet."; return; }
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  toolsBox.innerHTML = data.map((item) => {
    const safeUrl = /^https:\/\//i.test(item.url) ? item.url : "";
    return '<div class="account-panel"><strong>' + escapeHtml(item.title) + '</strong><p>' + escapeHtml(item.description) + '</p>' + (safeUrl ? '<a href="' + escapeHtml(safeUrl) + '" target="_blank" rel="noopener noreferrer">Open tool ↗</a>' : '') + '</div>';
  }).join("");
});
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
  const { data, error } = await supabase.from("customer_orders").select("id,service_type,details,status,created_at").order("created_at", { ascending: false }).limit(50);
  if (error) return memberMessage(error.message);
  memberMessage(data.length ? data.map((o) => o.service_type + " — " + o.status + "\n" + o.details + "\n" + new Date(o.created_at).toLocaleString()).join("\n\n") : "Abhi aapke account se koi order nahi juda hai. Existing WhatsApp enquiries automatically import nahi hote.");
});
init();

el("saveOrderToAccountBtn").addEventListener("click", async () => {
  if (!supabase || !currentUser) return;
  const details = el("orderDetails")?.value?.trim();
  const service_type = el("orderType")?.value?.trim();
  if (!details) return memberMessage("Pehle Order section mein apni requirement likho.");
  if (details.length > 2000) return memberMessage("Order details 2,000 characters se kam rakho.");
  const { error } = await supabase.from("customer_orders").insert({
    user_id: currentUser.id, service_type: service_type || "Editing enquiry", details
  });
  memberMessage(error ? error.message : "Enquiry aapke account ke order history mein save ho gayi. Isse payment ya booking confirm nahi hoti.");
});
