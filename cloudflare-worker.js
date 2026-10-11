const ALLOWED_ORIGIN = "https://rakeditingstudio.github.io";
const MODEL = "gemini-2.5-flash";

function cors(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (origin && origin !== ALLOWED_ORIGIN) {
      return json({ error: "Origin not allowed" }, 403, origin);
    }
    if (url.pathname !== "/api/chat") return json({ error: "Not found" }, 404, origin);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
    if (!env.GEMINI_API_KEY) return json({ error: "Server API key is not configured" }, 503, origin);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON request" }, 400, origin);
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 1200) {
      return json({ error: "Message must be between 1 and 1200 characters" }, 400, origin);
    }

    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const contents = [];
    for (const item of history) {
      if (!item || typeof item.text !== "string") continue;
      const role = item.role === "assistant" ? "model" : item.role === "user" ? "user" : null;
      if (!role) continue;
      const text = item.text.trim().slice(0, 1200);
      if (text) contents.push({ role, parts: [{ text }] });
    }
    // Avoid sending the latest user question twice when the frontend includes it in history.
    const last = contents[contents.length - 1];
    if (!(last && last.role === "user" && last.parts[0].text === message)) {
      contents.push({ role: "user", parts: [{ text: message }] });
    }

    try {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: "You are RAK AI, the friendly assistant for RAK Editing Studio. Help with video editing, photo editing, creator tools, AI prompts, and website guidance. Reply clearly and helpfully in the language the user uses, especially Hindi or Hinglish. Never claim you performed actions you did not perform." }]
            },
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 700 }
          })
        }
      );
      const data = await upstream.json();
      if (!upstream.ok) {
        const upstreamMessage = data?.error?.message || "No error details returned";
        const safeMessage = upstream.status === 400 ? "Gemini rejected the request (400). Check model name and request settings." : upstream.status === 401 || upstream.status === 403 ? "Gemini API authorization failed (" + upstream.status + "). Check that the API key is valid and the Generative Language API is enabled." : upstream.status === 404 ? "Gemini model or endpoint not found (404). Check the configured model name." : upstream.status === 429 ? "AI usage limit reached (429). Check Gemini quota and billing/limits." : "Gemini upstream HTTP " + upstream.status + ": " + upstreamMessage.slice(0, 240);
        return json({ error: safeMessage, upstreamStatus: upstream.status }, 502, origin);
      }
      const reply = (data.candidates || [])
        .flatMap(candidate => candidate.content?.parts || [])
        .map(part => part.text || "")
        .join("\n")
        .trim();
      if (!reply) return json({ error: "Gemini did not return a text reply" }, 502, origin);
      return json({ reply }, 200, origin);
    } catch {
      return json({ error: "Could not reach Gemini. Please try again later." }, 502, origin);
    }
  }
};
