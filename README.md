# Voice AI (Deepgram STT/TTS + Gemini LLM)

A minimal starter for realtime, voice-only chat.

## Prereqs

- Node 20+
- API keys for Deepgram + Google AI Studio (Gemini)

## Dev Setup

### 1) Realtime server

```bash
cd realtime-server
cp .env.example .env
# Edit .env with your keys
npm i
npm run dev
```


Backend runs on http://localhost:8080 (WS enabled). Check health at /health.

### 2) Frontend (Next.js)

```bash
cd ../web
cp .env.local.example .env.local
# Set NEXT_PUBLIC_REALTIME_WS_URL=ws://localhost:8080 (or wss on deploy)
npm i
npm run dev
```

Next.js on http://localhost:3000.

Open http://localhost:3000/voice in the browser.


### Deploy

- Frontend (web/): deploy to Vercel as usual (env var NEXT_PUBLIC_REALTIME_WS_URL=wss://realtime.yourdomain.com).
- Backend (realtime-server/): deploy to Fly.io/Render/Railway/DO. Make sure CORS has your production frontend origin.

### Notes

- We stream WebM/Opus 48k from the browser to Deepgram Live.
- On asr_final, we stream Gemini tokens and push each sentence into Deepgram Speak (Aura).
- We stream audio/mpeg chunks back to the browser; MediaSource does smooth playback.
- Barge-in: when user speaks, we emit cancel_tts and abort the current TTS stream.

### Customization

- Change Deepgram models/voices in .env.
- Add tools/function-calling in gemini.ts.
- Improve sentence boundary detection (use a proper sbd library) for better prosody.
# chat-bot-voice
