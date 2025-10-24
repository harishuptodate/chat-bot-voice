# WebSocket Connection Flow

## Before (❌ Broken)
```
Browser (localhost:3000)
    ↓
[socket.io client] ❌ (autoConnect: false, never connects)
    ↓
WebSocket Server (localhost:8080)
    ❌ Waiting for connection, but client never sends one
    ❌ Missing DEEPGRAM_API_KEY in .env
    ❌ Wrong TTS URL: https://api.createClient.com/v1/speak
```

---

## After (✅ Working)
```
Browser (localhost:3000)
    ↓
[socket.io client] 
    ↓
socket.connect() ✅ (explicit connection)
    ↓
WebSocket Server (localhost:8080)
    ↓ ✅ Connection established
io.on('connection', (socket) => {
    console.log("✅ WebSocket client connected:", socket.id)
    
    // Voice Input Flow
    socket.on('audio_chunk', ...) → Deepgram ASR → transcription
    
    // LLM Processing Flow  
    socket.on('agent_reply', ...) → Google Gemini → text response
    
    // Voice Output Flow
    [Text] → Deepgram TTS (https://api.deepgram.com/v1/speak) ✅
         → stream audio chunks → browser → audio playback
})
```

---

## Environment Setup
```
Backend (.env)
├── DEEPGRAM_API_KEY ✅ Required
├── GOOGLE_GEMINI_API_KEY ✅ Required
├── PORT = 8080
└── CORS_ORIGINS = http://localhost:3000

Frontend (.env.local)
└── NEXT_PUBLIC_REALTIME_WS_URL = http://localhost:8080
```

---

## Connection States

### 1. Initial Load (Browser)
```
State: idle
Socket status: connecting...
Console: 🔌 Attempting to connect to WebSocket server...
```

### 2. Connected
```
State: idle
Socket status: connected ✅
Console: ✅ WebSocket client connected: [socket-id]
Backend: ✅ WebSocket client connected: [socket-id]
```

### 3. During Speech Input
```
State: listening 🎤
Action: Audio chunks → socket.emit('audio_chunk', buf)
Backend: Receives chunks → Deepgram ASR
Backend: Emits 'asr_partial' & 'asr_final'
Frontend: Displays transcription
```

### 4. AI Response
```
State: speaking
Action: socket.emit('agent_reply', { text })
Backend: Streams Gemini LLM response
Backend: For each sentence:
  - Emits 'reply_text' (caption)
  - Calls Deepgram TTS API ✅
  - Streams audio via 'tts_chunk'
Frontend: Plays audio in real-time
```

### 5. Response Complete
```
State: idle
Backend: Emits 'tts_done'
Frontend: Ready for next input
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────┐
│                    User Browser                      │
│  ┌──────────────────────────────────────────────┐  │
│  │           Voice Chat App (React)             │  │
│  │  - Record audio (MediaRecorder)              │  │
│  │  - Display transcription                     │  │
│  │  - Play TTS audio                            │  │
│  └──────────────────┬───────────────────────────┘  │
│                     │                               │
│         WebSocket (socket.io)                      │
└─────────────────────┼──────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────┐
│            Node.js Realtime Server                  │
│  Port: 8080                                         │
│  ┌──────────────────────────────────────────────┐  │
│  │         Socket.io Connection Handler         │  │
│  └─────────────┬────────────┬────────────┬──────┘  │
│               │            │            │          │
│        ┌──────▼──┐  ┌──────▼──┐  ┌──────▼──┐     │
│        │ Deepgram│  │ Gemini  │  │ Deepgram│     │
│        │   ASR   │  │   LLM   │  │   TTS   │     │
│        │(Listen) │  │(Respond)│  │ (Voice) │     │
│        └─────────┘  └─────────┘  └─────────┘     │
│                                                   │
│ Key Fixes:                                        │
│ ✅ socket.connect() explicit call                 │
│ ✅ DEEPGRAM_API_KEY validation                    │
│ ✅ Correct TTS URL (api.deepgram.com)            │
│ ✅ Better error logging                          │
└─────────────────────────────────────────────────────┘
```

---

## Message Flow

```
User speaks
    ↓
Browser: Record audio → chunks every 200ms
    ↓
Browser: socket.emit('audio_chunk', buffer)
    ↓
Server: Receives 'audio_chunk' → dgLive.send(buffer)
    ↓
Deepgram: Transcribes in real-time
    ↓
Server: 'transcriptReceived' event
    ↓
Server: socket.emit('asr_partial', { text }) [live]
Server: socket.emit('asr_final', { text }) [complete]
    ↓
Browser: User sees final text
    ↓
Browser: socket.emit('agent_reply', { text })
    ↓
Server: Streams Gemini response word by word
    ↓
Server: For each sentence:
  1. socket.emit('reply_text', { text })
  2. Call Deepgram TTS API ✅
  3. Stream response body as 'tts_chunk' events
    ↓
Browser: Play audio in real-time
    ↓
Server: socket.emit('tts_done')
    ↓
Ready for next input
```

---

## Files Affected

```
realtime-server/
├── src/index.ts ✅ FIXED
│   ├── Line 24-27: Environment validation
│   ├── Line 35: Safe logging
│   ├── Line 42: Connection logging
│   └── Line 133: Correct TTS URL
│
web/
├── lib/socket.ts ✅ ENHANCED
│   ├── Error event listeners
│   └── Disconnect logging
│
└── app/voice/page.tsx ✅ FIXED
    └── Explicit socket.connect() call
```

