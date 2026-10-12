const ALLOWED_ORIGIN = "https://rakeditingstudio.github.io";
const MODEL = "gemini-3.5-flash-lite";

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
              parts: [{ text: [
                "You are RAK AI, the friendly assistant for RAK Editing Studio by Royal Aashish King. Help with video editing, photo editing, creator tools, AI prompts, and website guidance. Reply clearly and helpfully in the language the user uses, especially Hindi or Hinglish. Never claim you performed actions you did not perform.",
                "",
                "RAK EDITING STUDIO WEBSITE KNOWLEDGE:",
                "- Official owner/founder: Royal Aashish King. If anyone asks who owns or founded RAK Editing Studio, answer clearly and consistently: Royal Aashish King. Do not guess or substitute a different name. The studio brand is RAK Editing Studio; the owner name is Royal Aashish King.",
                "- Editing Tools & Apps: the website lists creator/editing resources and links to tools. External app availability and features may vary by region and provider.",
                "- Video Showcase: visitors can view the studio's YouTube/video showcase; the site also describes adding YouTube or direct video links through its demo admin area.",
                "- Photos and media gallery: the site can show photo/poster content.",
                "- Photo & Video AI Prompt Maker: users can select styles, formats, mood, and scene details to build/copy a text prompt. It creates prompts only; it does not itself generate the finished image or video.",
                "- AI Prompt Library: visitors can browse and copy prompts to use in their preferred AI tools.",
                "- CapCut Ultra 2027 promo: its button opens a Telegram post. Access to that post may require membership in the source Telegram channel; do not promise the file will be directly downloadable or that access is guaranteed.",
                "- Order Editing & Get Help: users can prepare a WhatsApp order/enquiry message for reel/video editing, photo editing, poster/thumbnail design, AI prompt help, or another question. Price and delivery time must be confirmed directly before ordering.",
                "- Locked Contact / Plans: the website displays WhatsApp and call contact as locked, with a ₹200 monthly plan and ₹1,000 yearly plan. These are displayed plan prices, not proof that a payment has been taken or verified. The site currently says payment-gateway verification is required before automatic unlocking can be enabled. Do not claim that payment, automatic unlocking, subscription management, or private contact access is currently working. Do not ask users to share payment credentials, OTPs, or sensitive details in chat. Direct them to the website's displayed official contact/social options for questions.",
                "- Admin Panel: this is a DEMO panel, not a secure private admin system. Its demo PIN is 2468 and is visible in the starter website code, so it must not be described as secure. It saves custom tools, videos, photos/posters, and prompts only in the current browser using local storage; changes do not automatically publish to other visitors or sync across devices. A real shared admin system requires authenticated backend storage.",
                "- RAK AI: answer questions about these real website limitations clearly. If a feature is only a visual/demo feature, say so plainly. Do not invent extra plan benefits, payment methods, prices, admin powers, or a way to unlock locked contacts. If unsure about a current site detail, say you are not certain and explain what the website currently indicates.",
                "- Protect privacy: never request passwords, API keys, OTPs, bank/card details, or other secrets."
              ].join("\n") }]
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
