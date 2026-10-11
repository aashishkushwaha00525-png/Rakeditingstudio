# RAK AI Gemini backend setup

The website's chatbox already points to:

`https://rakgpt-ai.royalaashishking.workers.dev/api/chat`

This repository file is the Worker source; committing it does **not** deploy it to Cloudflare automatically.

## Deploy safely

1. In Cloudflare, open Workers & Pages and select the existing `rakgpt-ai` Worker (or create one with that name).
2. Replace its Worker code with `cloudflare-worker.js`.
3. In the Worker settings, add a secret named `GEMINI_API_KEY`. Paste the newly created Gemini key there. Never put the key in `index.html`, this repository, or a public chat.
4. Deploy the Worker.
5. Open the website and test RAK AI. The Worker endpoint must remain `/api/chat`.

The allowed website origin is `https://rakeditingstudio.github.io`. If your site uses a different custom domain, update `ALLOWED_ORIGIN` in the Worker code before deploying.

## Security note

If a key was pasted into a chat, issue a replacement key and revoke the exposed one. Keep the replacement only as a Worker secret. API usage may incur charges or hit quota limits depending on the Google AI Studio account and model terms; check the current quota before using it heavily.
