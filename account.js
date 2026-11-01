import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config.js";

const byId = (id) => document.getElementById(id);
const signedOut = byId("googleAuthSignedOut");
const signedIn = byId("googleAuthSignedIn");
const status = byId("googleAuthStatus");
const signInButton = byId("googleSignInBtn");
const signOutButton = byId("googleSignOutBtn");

function setStatus(text, isError = false) {
  status.textContent = text;
  status.style.color = isError ? "#ff9b9b" : "";
}
function showUser(user) {
  const isSignedIn = !!user;
  signedOut.classList.toggle("hidden", isSignedIn);
  signedIn.classList.toggle("hidden", !isSignedIn);
  if (!user) {
    byId("googleUserName").textContent = "";
    byId("googleUserEmail").textContent = "";
    byId("googleUserAvatar").removeAttribute("src");
    return;
  }
  const meta = user.user_metadata || {};
  byId("googleUserName").textContent = meta.full_name || meta.name || user.email || "Google user";
  byId("googleUserEmail").textContent = user.email || "";
  const avatar = meta.avatar_url || meta.picture || "";
  if (avatar && /^https:\/\//i.test(avatar)) byId("googleUserAvatar").src = avatar;
  else byId("googleUserAvatar").removeAttribute("src");
}

const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) &&
  typeof SUPABASE_PUBLISHABLE_KEY === "string" &&
  SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_");

if (!configured) {
  signInButton.disabled = true;
  setStatus("Google sign-in setup is incomplete. Please contact the site owner.", true);
} else {
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const { data, error } = await supabase.auth.getSession();
  if (error) setStatus(error.message, true);
  showUser(data?.session?.user || null);

  supabase.auth.onAuthStateChange((event, session) => {
    showUser(session?.user || null);
    if (event === "SIGNED_IN") setStatus("Google account connected successfully.");
    if (event === "SIGNED_OUT") setStatus("You have been signed out.");
    if (event === "TOKEN_REFRESHED") setStatus("Your Google sign-in session is active.");
  });

  signInButton.addEventListener("click", async () => {
    signInButton.disabled = true;
    setStatus("Opening Google sign-in…");
    const redirectTo = window.location.origin + window.location.pathname;
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account" },
        scopes: "openid email profile"
      }
    });
    if (authError) {
      setStatus("Google sign-in could not start: " + authError.message, true);
      signInButton.disabled = false;
    }
  });

  signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true;
    const { error: authError } = await supabase.auth.signOut();
    if (authError) setStatus("Sign-out failed: " + authError.message, true);
    signOutButton.disabled = false;
  });

  const params = new URLSearchParams(window.location.search);
  const oauthError = params.get("error_description") || params.get("error");
  if (oauthError) setStatus("Google sign-in error: " + oauthError, true);
}
