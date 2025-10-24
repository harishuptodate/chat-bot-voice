# AI Voice Chat Starter (Next.js + Express/Socket.IO + Deepgram STT/TTS + Google Gemini)

This is a complete, minimal-but-production-minded starter that gives you a **voice-only AI chat**: user speaks, AI speaks back, with **Deepgram Live STT**, **Gemini (Google AI Studio) for LLM**, and **Deepgram Aura TTS** in streaming mode.

- Frontend: **Next.js (App Router)** – deploy on **Vercel** ✅
- Backend: **Node.js Express + Socket.IO** (WebSockets) – deploy on Fly.io/Render/Railway/DO ✅

> Why two services? Vercel Functions/Edge do **not** host Socket.IO/WebSocket servers reliably. Keep realtime on a WS-friendly host; keep UI & HTTP on Vercel.

---

## Monorepo Structure

```
voice-ai/
  README.md
  .gitignore

  realtime-server/       # Express + Socket.IO + Deepgram + Gemini (WS backend)
    package.json
    tsconfig.json
    .env.example
    src/
      index.ts
      gemini.ts
      types.ts
    Dockerfile

  web/                   # Next.js frontend (Vercel-friendly)
    package.json
    next.config.mjs
    tsconfig.json
    .env.local.example
    app/
      layout.tsx
      globals.css
      voice/
        page.tsx
    lib/
      socket.ts
      audio/
        recorder.ts
        player.ts
```

---

## 1) Backend: `realtime-server`

### `realtime-server/package.json`
```json
{
  "name": "realtime-server",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "build": "tsc -p .",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@deepgram/sdk": "^3.8.0",
    "@google/generative-ai": "^0.19.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "node-fetch": "^3.3.2",
    "socket.io": "^4.7.5"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.30",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.6.3"
  }
}
```

### `realtime-server/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2020",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

### `realtime-server/.env.example`
```
PORT=8080
# Allow your local Next.js and deployed frontend origins (comma-separated)
CORS_ORIGINS=http://localhost:3000,https://your-frontend-domain.com

# Deepgram
DEEPGRAM_API_KEY=dg_xxxxxxxxxxxxxxxxxxxxxxxxx
DG_ASR_MODEL=nova-2
DG_TTS_VOICE=aura-asteria-en

# Google AI Studio (Gemini)
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxx
GEMINI_MODEL=gemini-2.5-flash
```

### `realtime-server/src/types.ts`
```ts
export type ServerToClient = {
  asr_partial: (payload: { text: string; start?: number; end?: number }) => void;
  asr_final: (payload: { text: string; start?: number; end?: number }) => void;
  thinking: () => void;
  reply_text: (payload: { text: string }) => void; // optional captions
  tts_chunk: (payload: ArrayBuffer) => void;
  tts_done: () => void;
  error: (payload: { code: string; message?: string }) => void;
};

export type ClientToServer = {
  start: (payload: { sessionId?: string; lang?: string; voice?: string }) => void;
  audio_chunk: (payload: ArrayBuffer) => void; // WebM/Opus 48k frames
  stop_talk: () => void; // user/VAD says turn ended
  cancel_tts: () => void; // barge-in
};
```

### `realtime-server/src/gemini.ts`
```ts
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY!;
const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const genAI = new GoogleGenerativeAI(apiKey);
export const geminiModel = genAI.getGenerativeModel({ model: modelName });

export async function* streamGeminiReply(userText: string) {
  const resp = await geminiModel.generateContentStream({
    contents: [{ role: "user", parts: [{ text: userText }]}],
    generationConfig: { temperature: 0.6, topP: 0.9 }
  });
  for await (const chunk of resp.stream) {
    const t = chunk.text();
    if (t) yield t;
  }
}
```

### `realtime-server/src/index.ts`
```ts
import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { Deepgram } from "@deepgram/sdk";
import fetch from "node-fetch";
import { geminiModel, streamGeminiReply } from "./gemini.js";

const PORT = parseInt(process.env.PORT || "8080", 10);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:3000").split(",").map(s => s.trim());

const DG_KEY = process.env.DEEPGRAM_API_KEY!;
const DG_ASR_MODEL = process.env.DG_ASR_MODEL || "nova-2";
const DG_TTS_VOICE = process.env.DG_TTS_VOICE || "aura-asteria-en";

const app = express();
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGINS, credentials: true },
  maxHttpBufferSize: 1e7 // ~10MB
});

const dg = new Deepgram(DG_KEY);

type DGStream = ReturnType<typeof dg.listen.live> extends Promise<infer P> ? P : any;

io.on("connection", (socket) => {
  let dgLive: DGStream | null = null;
  let ttsAbort: AbortController | null = null;

  const stopAnyTTS = () => {
    if (ttsAbort) {
      try { ttsAbort.abort(); } catch {}
      ttsAbort = null;
    }
    socket.emit("tts_done");
  };

  socket.on("start", async ({ lang = "en-US", voice }: { lang?: string; voice?: string }) => {
    try {
      dgLive = await dg.listen.live({
        model: DG_ASR_MODEL,
        language: lang,
        interim_results: true,
        smart_format: true,
        encoding: "opus",
        sample_rate: 48000
      });

      dgLive.addListener("open", () => console.log("Deepgram live open"));

      dgLive.addListener("transcriptReceived", (msg: any) => {
        const alt = msg?.channel?.alternatives?.[0];
        const text = alt?.transcript || "";
        if (!text) return;
        if (msg.is_final) socket.emit("asr_final", { text });
        else socket.emit("asr_partial", { text });
      });

      dgLive.addListener("error", (e: any) => {
        socket.emit("error", { code: "DG_ASR", message: e?.message || String(e) });
      });

      dgLive.addListener("close", () => console.log("Deepgram live closed"));
    } catch (e: any) {
      socket.emit("error", { code: "DG_ASR_OPEN", message: e?.message || String(e) });
    }
  });

  socket.on("audio_chunk", async (buf: ArrayBuffer) => {
    if (!dgLive) return;
    try { dgLive.send(Buffer.from(buf)); } catch {}
  });

  socket.on("stop_talk", async () => {
    if (!dgLive) return;
    try { dgLive.flush(); } catch {}
  });

  socket.on("cancel_tts", () => {
    stopAnyTTS();
  });

  // When the client/UI decides to create a reply from the latest asr_final
  socket.on("agent_reply", async ({ text, voice }: { text: string; voice?: string }) => {
    if (!text || !text.trim()) return;

    // 1) Stream Gemini tokens
    socket.emit("thinking");
    let buffer = "";

    const flushSentenceToTTS = async (sentence: string) => {
      if (!sentence.trim()) return;
      // cancel previous TTS if you want utterance-at-a-time policy
      stopAnyTTS();
      ttsAbort = new AbortController();

      const url = `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voice || DG_TTS_VOICE)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Token ${DG_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: sentence }),
        signal: ttsAbort.signal
      });
      if (!res.ok) {
        socket.emit("error", { code: "DG_TTS", message: `HTTP ${res.status}` });
        return;
      }
      if (!res.body) return;

      // stream chunks to client immediately
      for await (const chunk of res.body as any) {
        socket.emit("tts_chunk", Buffer.from(chunk));
      }
      socket.emit("tts_done");
      ttsAbort = null;
    };

    try {
      for await (const piece of streamGeminiReply(text)) {
        buffer += piece;
        // naive sentence splitting; improve with an sbd lib if needed
        let m: RegExpExecArray | null;
        const re = /([^.!?\n]+[.!?])(\s|$)/g;
        while ((m = re.exec(buffer))) {
          const sentence = m[1];
          socket.emit("reply_text", { text: sentence }); // optional captions
          await flushSentenceToTTS(sentence);
        }
        // keep only trailing fragment
        buffer = buffer.replace(/([^.!?\n]+[.!?])(\s|$)/g, "");
      }
      if (buffer.trim()) {
        socket.emit("reply_text", { text: buffer.trim() });
        await flushSentenceToTTS(buffer.trim());
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return; // canceled (barge-in)
      socket.emit("error", { code: "LLM_STREAM", message: e?.message || String(e) });
    }
  });

  socket.on("disconnect", () => {
    try { dgLive?.close(); } catch {}
    stopAnyTTS();
  });
});

server.listen(PORT, () => {
  console.log(`Realtime server listening on :${PORT}`);
});
```

### `realtime-server/Dockerfile`
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm install --production=false || true
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["npm", "start"]
```

---

## 2) Frontend: `web` (Next.js, App Router)

### `web/package.json`
```json
{
  "name": "voice-web",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "socket.io-client": "^4.7.5"
  },
  "devDependencies": {
    "@types/node": "^20.11.30",
    "@types/react": "^18.2.66",
    "@types/react-dom": "^18.2.22",
    "typescript": "^5.6.3"
  }
}
```

### `web/next.config.mjs`
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  }
};
export default nextConfig;
```

### `web/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      { "name": "next" }
    ]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

### `web/.env.local.example`
```
# Where your WS backend is reachable
NEXT_PUBLIC_REALTIME_WS_URL=wss://realtime.yourdomain.com
```

### `web/app/layout.tsx`
```tsx
export const metadata = { title: "Voice AI" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

### `web/app/globals.css`
```css
* { box-sizing: border-box; }
body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 16px; }
button { padding: 8px 12px; margin-right: 8px; }
.badge { display:inline-block; padding:2px 8px; border-radius: 8px; background:#eee; margin-left:8px; }
.wave { height:8px; background: linear-gradient(90deg,#ddd,#bbb,#ddd); animation: move 1.5s linear infinite; }
@keyframes move { from { background-position:0 0; } to { background-position:200% 0; } }
```

### `web/lib/socket.ts`
```ts
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_REALTIME_WS_URL || "ws://localhost:8080";
    socket = io(url, { transports: ["websocket"] });
  }
  return socket;
}
```

### `web/lib/audio/recorder.ts`
```ts
export async function createRecorder(onChunk: (buf: ArrayBuffer) => void) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  const rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 32000 });
  rec.ondataavailable = async (e) => {
    if (!e.data || e.data.size === 0) return;
    const buf = await e.data.arrayBuffer();
    onChunk(buf);
  };
  return rec;
}
```

### `web/lib/audio/player.ts`
```ts
// Streaming MP3/OGG with MediaSource for smooth playback
export class StreamPlayer {
  private mediaSource: MediaSource;
  private audio: HTMLAudioElement;
  private sourceBuffer: SourceBuffer | null = null;
  private queue: Uint8Array[] = [];
  private mime = 'audio/mpeg'; // Deepgram can return chunked MPEG; adjust if needed

  constructor(el?: HTMLAudioElement) {
    this.audio = el || new Audio();
    this.audio.autoplay = true;
    this.mediaSource = new MediaSource();
    this.audio.src = URL.createObjectURL(this.mediaSource);

    this.mediaSource.addEventListener('sourceopen', () => {
      if (!MediaSource.isTypeSupported(this.mime)) {
        console.warn('MIME not supported for MediaSource:', this.mime);
        return;
      }
      this.sourceBuffer = this.mediaSource.addSourceBuffer(this.mime);
      this.sourceBuffer.mode = 'sequence';
      this.sourceBuffer.addEventListener('updateend', () => this.drain());
      this.drain();
    });
  }

  append(chunk: ArrayBuffer) {
    this.queue.push(new Uint8Array(chunk));
    this.drain();
  }

  private drain() {
    if (!this.sourceBuffer || this.sourceBuffer.updating) return;
    const next = this.queue.shift();
    if (next) {
      try { this.sourceBuffer.appendBuffer(next); }
      catch (e) { console.warn('appendBuffer error', e); }
    }
  }

  end() {
    try { this.mediaSource.endOfStream(); } catch {}
  }

  get element() { return this.audio; }
}
```

### `web/app/voice/page.tsx`
```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { createRecorder } from '@/lib/audio/recorder';
import { StreamPlayer } from '@/lib/audio/player';

export default function VoicePage() {
  const [status, setStatus] = useState<'idle'|'listening'|'speaking'>('idle');
  const [partial, setPartial] = useState('');
  const [finalText, setFinalText] = useState('');
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const playerRef = useRef<StreamPlayer | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('start', { lang: 'en-US', voice: 'aura-asteria-en' });
    });

    socket.on('asr_partial', ({ text }) => setPartial(text));
    socket.on('asr_final', ({ text }) => {
      setFinalText(text);
      setPartial('');
      setStatus('speaking');
      // request LLM -> TTS
      socket.emit('agent_reply', { text });
    });

    socket.on('reply_text', ({ text }) => {
      // Optional: show AI captions as they are sent to TTS
      // console.log('AI says:', text);
    });

    socket.on('tts_chunk', (binary: ArrayBuffer) => {
      if (!playerRef.current) {
        playerRef.current = new StreamPlayer();
        document.body.appendChild(playerRef.current.element);
      }
      playerRef.current.append(binary);
    });

    socket.on('tts_done', () => {
      setStatus('idle');
    });

    socket.on('error', (e) => console.error('Server error', e));

    return () => { socket.disconnect(); };
  }, []);

  const startPTT = async () => {
    if (status === 'speaking') {
      // barge-in
      socketRef.current?.emit('cancel_tts');
    }
    const rec = await createRecorder((buf) => {
      socketRef.current?.emit('audio_chunk', buf);
    });
    recRef.current = rec;
    rec.start(200); // every 200ms
    setStatus('listening');
  };

  const stopPTT = () => {
    recRef.current?.stop();
    setStatus('idle');
    socketRef.current?.emit('stop_talk');
  };

  return (
    <main>
      <h1>Voice Chat (Deepgram + Gemini)</h1>
      <div>WS: <span className='badge'>{socketRef.current?.connected ? 'connected' : 'connecting...'}</span></div>
      <div>Status: <span className='badge'>{status}</span></div>

      <div style={{marginTop:12}}>
        <button onClick={startPTT}>🎤 Push-to-talk (start)</button>
        <button onClick={stopPTT}>⏹ Stop talk</button>
        {status === 'speaking' && (
          <button onClick={() => socketRef.current?.emit('cancel_tts')}>⏹ Barge-in</button>
        )}
      </div>

      <div style={{marginTop:16}}>
        <strong>Heard (partial):</strong> {partial}
      </div>
      <div style={{marginTop:8}}>
        <strong>Last user turn:</strong> {finalText}
      </div>

      <div style={{marginTop:16}} className='wave' />
    </main>
  );
}
```

---

## 3) Root Files

### `README.md`
```md
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
Backend runs on http://localhost:8080 (WS enabled). Check health at `/health`.

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

## Deploy
- **Frontend (web/)**: deploy to **Vercel** as usual (env var `NEXT_PUBLIC_REALTIME_WS_URL=wss://realtime.yourdomain.com`).
- **Backend (realtime-server/)**: deploy to Fly.io/Render/Railway/DO. Make sure CORS has your production frontend origin.

## Notes
- We stream **WebM/Opus 48k** from the browser to **Deepgram Live**.
- On `asr_final`, we stream **Gemini** tokens and push each **sentence** into **Deepgram Speak (Aura)**.
- We stream **audio/mpeg** chunks back to the browser; **MediaSource** does smooth playback.
- **Barge-in**: when user speaks, we emit `cancel_tts` and abort the current TTS stream.

## Customization
- Change Deepgram models/voices in `.env`.
- Add tools/function-calling in `gemini.ts`.
- Improve sentence boundary detection (use a proper sbd library) for better prosody.
```

### `.gitignore`
```
# Node
node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.DS_Store

# Builds
realtime-server/dist
.web
.next
out

# Env
.env
.env.local
realtime-server/.env
web/.env.local
```

---

## 4) How a turn flows (recap)
1. **Push-to-talk** → browser sends `audio_chunk` (WebM/Opus 48k) every 200 ms.
2. Backend pipes to **Deepgram Live** → emits `asr_partial` (optional captions), then `asr_final`.
3. UI sends `agent_reply` with the final text (demo echoes; in real use, you can let server trigger it automatically on `asr_final`).
4. Server streams **Gemini** tokens → splits into sentences → for each sentence calls **Deepgram Speak** and forwards `tts_chunk` → client plays immediately.
5. **Barge-in**: user speaks → client emits `cancel_tts` → backend aborts current TTS.

You now have a working baseline. Add auth, memory, and function-calling as needed.

