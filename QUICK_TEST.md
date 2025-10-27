# Quick Test Checklist

## 🚀 Start Servers

### Terminal 1 - Backend

```bash
cd realtime-server
pnpm dev
```

**Must see:**

- `✅ Deepgram client initialized`
- `Realtime server listening on :8080`

### Terminal 2 - Frontend

```bash
cd web
pnpm dev
```

Open: http://localhost:3000

---

## ✅ Test Checklist

### 1. Connection Test

- [ ] Browser shows "connected" (green badge)
- [ ] Server logs: `✅ WebSocket client connected`
- [ ] Browser logs: `✅ WebSocket CONNECTED`
- [ ] Server logs: `🎙️ START event received`

### 2. Recording Test

- [ ] Click "🎤 Push-to-talk (start)"
- [ ] Browser logs: `🎤 Push-to-talk STARTED`
- [ ] Speak into microphone
- [ ] Server logs: `🎵 Sent 10 audio chunks...` (every 10 chunks)
- [ ] Browser logs: `🎵 Sent 10 audio chunks...` (every 10 chunks)

### 3. Transcription Test

- [ ] Click "⏹ Stop talk"
- [ ] Server logs: `⏹️ STOP_TALK event received (sent X total chunks)`
- [ ] Server logs: `✅ Deepgram stream finished`
- [ ] **CRITICAL:** Server logs: `📝 ASR FINAL: "your text here"`
- [ ] Browser logs: `✅ ASR FINAL received: "your text here"`
- [ ] **UI shows:** Blue panel with "YOU SAID: your text here"

### 4. AI Response Test

- [ ] Browser logs: `🤖 Sending AGENT_REPLY to server`
- [ ] Server logs: `🤖 AGENT_REPLY event - User said: "..."`
- [ ] Server logs: `🧠 Starting Gemini stream...`
- [ ] Server logs: `🧠 Gemini chunk: "..."`
- [ ] Server logs: `💬 Sending reply_text: "..."`
- [ ] Browser logs: `💬 AI REPLY TEXT received: "..."`
- [ ] **UI shows:** Green panel with "AI SAYS: ..."

### 5. Audio Playback Test

- [ ] Server logs: `🔊 Converting to speech: "..."`
- [ ] Server logs: `✅ TTS complete - sent X audio chunks`
- [ ] Browser logs: `🔊 TTS CHUNK received, size: X`
- [ ] Browser logs: `🎵 StreamPlayer created and added to DOM` (first time only)
- [ ] Browser logs: `✅ TTS DONE`
- [ ] **Hear:** AI voice speaking

---

## ❌ Common Failures

### Failure Point 1: No Connection

**Symptoms:**

- "connecting..." never changes to "connected"
- Connection errors in browser console

**Fix:**

- Check if server is running on port 8080
- Check if client is connecting to http://localhost:8080 (not ws://)
- Check CORS settings

### Failure Point 2: No Transcription (MOST COMMON)

**Symptoms:**

- ✅ Audio chunks are sent
- ❌ Never see `📝 ASR FINAL` in server logs
- ❌ Blue "YOU SAID" panel doesn't appear

**This means Deepgram is NOT transcribing. Check:**

1. **API Key:** Is `DEEPGRAM_API_KEY` in `realtime-server/.env` valid?
2. **Credits:** Does your Deepgram account have credits?
3. **Connection:** Do you see `✅ Deepgram live connection OPENED`?
4. **Errors:** Any `❌ Deepgram ASR error` messages?

**Test API Key:**

```bash
curl -X GET "https://api.deepgram.com/v1/projects" \
  -H "Authorization: Token YOUR_KEY_HERE"
```

### Failure Point 3: No AI Response

**Symptoms:**

- ✅ Transcription works (see `📝 ASR FINAL`)
- ❌ No Gemini chunks in logs
- ❌ Green "AI SAYS" panel doesn't appear

**Check:**

- Is `GEMINI_API_KEY` in `realtime-server/.env` valid?
- Look for `❌ LLM stream error` in server logs

### Failure Point 4: No Audio Playback

**Symptoms:**

- ✅ AI text response appears
- ❌ No audio plays
- ❌ No TTS chunks in logs

**Check:**

- Look for `❌ TTS API error` in server logs
- Check if Deepgram API key has TTS enabled
- Verify TTS URL is correct (should be `https://api.deepgram.com/v1/speak`)

---

## 🔑 Critical Environment Variables

Create `realtime-server/.env`:

```bash
DEEPGRAM_API_KEY=your_deepgram_key_here
GEMINI_API_KEY=your_gemini_key_here
PORT=8080
CORS_ORIGINS=http://localhost:3000
```

---

## 🎯 Success Indicators

If everything works, you should see:

**Browser UI:**

1. Green "connected" badge
2. Status changes: idle → listening → speaking → idle
3. Blue panel: "YOU SAID: [your speech]"
4. Green panel: "AI SAYS: [AI response]"
5. Hear AI voice speaking

**Server Logs (in order):**

```
✅ WebSocket client connected
🎙️  START event received
✅ Deepgram live connection OPENED
🎵 Sent 10 audio chunks to Deepgram
🎵 Sent 20 audio chunks to Deepgram
⏹️  STOP_TALK event received (sent 47 total chunks)
✅ Deepgram stream finished
📝 ASR FINAL: "your text"
🤖 AGENT_REPLY event - User said: "your text"
🧠 Starting Gemini stream...
🧠 Gemini chunk: "response"
💬 Sending reply_text: "response."
🔊 Converting to speech: "response."
✅ TTS complete - sent 15 audio chunks
✅ Agent reply complete
```

---

## 📸 Screenshot Checklist

Take a screenshot if things don't work and check:

- [ ] Connection status badge color
- [ ] Browser console (F12) - any errors?
- [ ] Server console - where did it stop?
- [ ] UI panels - do they appear?

The logs will tell you exactly where it's failing!
