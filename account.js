import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config.js";

const byId = (id) => document.getElementById(id);
const signInButton = byId("googleSignInBtn");
const profileDetails = byId("profileDetails");
const status = byId("googleAuthStatus");
const signOutButton = byId("googleSignOutBtn");

function setStatus(message, isError = false) {
  if (!status) return;
  status.textContent = message;
  status.dataset.error = isError ? "true" : "false";
}

function showUser(user) {
  if (!signInButton || !profileDetails) return;
  const signedIn = Boolean(user);
  signInButton.classList.toggle("hidden", signedIn);
  profileDetails.classList.toggle("hidden", !signedIn);
  if (!signedIn) {
    byId("googleUserName").textContent = "";
    byId("googleUserEmail").textContent = "";
    byId("googleUserAvatar").removeAttribute("src");
    profileDetails.open = false;
    signInButton.setAttribute("aria-label", "Sign in with Google");
    signInButton.title = "Sign in with Google";
    return;
  }
  const meta = user.user_metadata || {};
  byId("googleUserName").textContent = "RAK Editing Studio";
  byId("googleUserEmail").textContent = user.email || "";
  const avatar = meta.avatar_url || meta.picture || "";
  const image = byId("googleUserAvatar");
  if (avatar && /^https:\/\//i.test(avatar)) image.src = avatar;
  else image.removeAttribute("src");
}

if (!signInButton || !profileDetails || !signOutButton) {
  console.error("RAK account UI elements are missing.");
} else {
  const configured =
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) &&
    typeof SUPABASE_PUBLISHABLE_KEY === "string" &&
    SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_");

  if (!configured) {
    signInButton.disabled = true;
    setStatus("Google sign-in setup is incomplete. Please contact the site owner.", true);
  } else {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });

      // Attach click handlers before checking the saved session so the button is responsive immediately.
      window.rakGoogleAuthReady = true;
      signInButton.addEventListener("click", async () => {
        signInButton.disabled = true;
        setStatus("Opening Google sign-in…");
        try {
          const redirectTo = window.location.origin + window.location.pathname;
          const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo,
              queryParams: { prompt: "select_account" },
              scopes: "openid email profile"
            }
          });
          if (error) throw error;
        } catch (error) {
          setStatus("Google sign-in could not start: " + (error?.message || "Unknown error"), true);
          signInButton.disabled = false;
        }
      });

      signOutButton.addEventListener("click", async () => {
        signOutButton.disabled = true;
        try {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
        } catch (error) {
          setStatus("Sign-out failed: " + (error?.message || "Unknown error"), true);
        } finally {
          signOutButton.disabled = false;
        }
      });

      supabase.auth.onAuthStateChange((event, session) => {
        showUser(session?.user || null);
        if (event === "SIGNED_IN") setStatus("Google account connected successfully.");
        if (event === "SIGNED_OUT") setStatus("You have been signed out.");
      });

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) setStatus("Could not restore login: " + error.message, true);
        showUser(data?.session?.user || null);
      } catch (error) {
        showUser(null);
        setStatus("Could not load account session: " + (error?.message || "Please reload the page."), true);
      }

      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get("error_description") || params.get("error");
      if (oauthError) setStatus("Google sign-in error: " + oauthError, true);
    } catch (error) {
      signInButton.disabled = true;
      setStatus("Account system could not load: " + (error?.message || "Please reload the page."), true);
      console.error("RAK account initialization failed:", error);
    }
  }
}
