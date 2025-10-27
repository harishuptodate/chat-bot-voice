# Debugging Guide - Voice AI Application

## Overview

Comprehensive logging has been added to both the server and client to track the entire voice conversation flow.

## Server Logs (realtime-server)

The server now logs every step of the process:

### Connection Events

- `✅ WebSocket client connected: [socket-id]` - When a client connects
- `🔌 [socket-id] Client disconnected` - When a client disconnects

### ASR (Speech-to-Text) Flow

- `🎙️ [socket-id] START event received` - When client requests to start ASR
- `✅ [socket-id] Deepgram live connection OPENED` - Deepgram connection established
- `🎵 [socket-id] Sent audio chunk (X bytes) to Deepgram` - Each audio chunk sent
- `📝 [socket-id] ASR PARTIAL: "text"` - Interim transcription results
- `📝 [socket-id] ASR FINAL: "text"` - Final transcription result
- `⏹️ [socket-id] STOP_TALK event received` - When user stops talking
- `✅ [socket-id] Deepgram stream flushed` - Audio stream finalized

### AI Response Flow

- `🤖 [socket-id] AGENT_REPLY event - User said: "text"` - AI processing starts
- `💭 [socket-id] Sent 'thinking' event to client` - Thinking state sent
- `🧠 [socket-id] Starting Gemini stream...` - LLM stream begins
- `🧠 [socket-id] Gemini chunk: "text"` - Each token from Gemini
- `💬 [socket-id] Sending reply_text: "sentence"` - Text caption sent to client

### TTS (Text-to-Speech) Flow

- `🔊 [socket-id] Converting to speech: "sentence"` - TTS conversion starts
- `✅ [socket-id] TTS complete - sent X audio chunks` - TTS finished
- `❌ [socket-id] TTS API error: HTTP XXX` - TTS errors

### Errors

- `❌ [socket-id] Deepgram ASR error:` - Speech recognition errors
- `❌ [socket-id] Error sending audio chunk:` - Audio transmission errors
- `❌ [socket-id] LLM stream error:` - AI generation errors
- `⚠️ [socket-id] Received audio_chunk but dgLive is not initialized` - State errors

## Client Logs (web frontend)

The browser console logs every client-side event:

### Connection

- `🔌 Socket initialized:` - Socket object created
- `🔌 Attempting to connect to WebSocket server...` - Connection attempt
- `✅ WebSocket CONNECTED - Socket ID: xxx` - Successfully connected
- `🎙️ Sent START event to server` - ASR session started
- `❌ Connection error:` - Connection failures
- `⚠️ Disconnected: reason` - Disconnection events

### Recording

- `🎤 Push-to-talk STARTED` - User pressed record button
- `👂 Now LISTENING - Recording started` - Recording active
- `🎵 Sending audio chunk to server, size: X` - Each audio chunk sent
- `⏹️ Push-to-talk STOPPED` - User released record button
- `✅ Recording stopped and stream closed` - Recording cleanup
- `📤 Sending STOP_TALK to server` - Finalization signal sent

### Transcription

- `📝 ASR PARTIAL received: "text"` - Interim results
- `✅ ASR FINAL received: "text"` - Final transcription
- `🤖 Sending AGENT_REPLY to server with text: "text"` - Request AI response

### AI Response

- `💭 AI is thinking...` - Processing state
- `💬 AI REPLY TEXT received: "text"` - AI response text
- `🔊 TTS CHUNK received, size: X` - Audio chunk received
- `🎵 StreamPlayer created and added to DOM` - Audio player initialized
- `✅ TTS DONE - Audio playback complete` - Response finished

### Errors

- `❌ Server error:` - Server-side errors
- `❌ Connection error:` - WebSocket errors

## Visual Debug Display

The UI now shows two debug panels:

### "YOU SAID" Panel (Blue)

- Shows real-time partial transcriptions (italic, "partial...")
- Shows final transcription (bold)
- Appears when you're speaking or have spoken

### "AI SAYS" Panel (Green)

- Shows the AI's text response
- Appears when AI is responding
- Updates in real-time as AI generates text

## Debugging Workflow

### 1. Test Connection

Start the server and client, then check:

- ✅ Browser console shows "WebSocket CONNECTED"
- ✅ Server console shows "WebSocket client connected"
- ✅ Server console shows "START event received"

### 2. Test Audio Recording

Click "Push-to-talk (start)" and speak:

- ✅ Browser shows "Push-to-talk STARTED"
- ✅ Browser shows "Sending audio chunk" messages repeatedly
- ✅ Server shows "Sent audio chunk to Deepgram" messages

### 3. Test Speech Recognition

After speaking, click "Stop talk":

- ✅ Server shows "ASR PARTIAL" messages (optional)
- ✅ Server shows "ASR FINAL" message with your text
- ✅ Browser shows "ASR FINAL received" with your text
- ✅ "YOU SAID" panel appears with your transcription

### 4. Test AI Response

After transcription finishes:

- ✅ Browser sends "AGENT_REPLY" to server
- ✅ Server shows "AGENT_REPLY event - User said: ..."
- ✅ Server shows "Starting Gemini stream..."
- ✅ Server shows Gemini chunks being generated
- ✅ Browser receives "AI REPLY TEXT"
- ✅ "AI SAYS" panel appears with response

### 5. Test Audio Playback

As AI responds:

- ✅ Server shows "Converting to speech"
- ✅ Server shows "TTS complete - sent X audio chunks"
- ✅ Browser receives TTS chunks
- ✅ Browser shows "StreamPlayer created" (first time)
- ✅ Browser shows "TTS DONE"
- ✅ Status returns to "idle"

## Common Issues

### No Connection

**Symptoms:** "connecting..." never changes to "connected"
**Check:**

1. Is server running on port 8080?
2. Any connection errors in browser console?
3. Check server logs for connection attempts

### No Transcription

**Symptoms:** Speaking but no "ASR PARTIAL" or "ASR FINAL" logs
**Check:**

1. Are audio chunks being sent? (Look for "Sending audio chunk" logs)
2. Is Deepgram API key valid? (Check server startup logs)
3. Is microphone permission granted?
4. Is dgLive initialized? (Look for "Deepgram live connection OPENED")

### No AI Response

**Symptoms:** Transcription works but no AI reply
**Check:**

1. Is "AGENT_REPLY" event sent? (Browser console)
2. Is server receiving it? (Server shows "AGENT_REPLY event")
3. Is Gemini stream starting? (Look for "Starting Gemini stream")
4. Check Gemini API key in .env file
5. Any LLM stream errors in server logs?

### No Audio Playback

**Symptoms:** AI text appears but no audio
**Check:**

1. Are TTS chunks being sent by server? (Look for "TTS complete")
2. Are TTS chunks received by browser? (Look for "TTS CHUNK received")
3. Is StreamPlayer created? (Look for "StreamPlayer created")
4. Check Deepgram TTS API key
5. Any TTS API errors in server logs?

## Quick Test Commands

### Test WebSocket Connection (Browser Console)

```javascript
// Should show connected status
console.log('Socket connected:', socketRef.current?.connected);
```

### Test Manual Transcription (Skip recording)

```javascript
// Manually trigger AI response without recording
socketRef.current?.emit('agent_reply', { text: 'Hello, how are you?' });
```

### Force Reconnect

```javascript
// Disconnect and reconnect
socketRef.current?.disconnect();
socketRef.current?.connect();
```

## Environment Variables to Check

### realtime-server/.env

```bash
DEEPGRAM_API_KEY=your_key_here     # Required for ASR and TTS
GEMINI_API_KEY=your_key_here       # Required for AI responses
PORT=8080                           # Must match client
CORS_ORIGINS=http://localhost:3000 # Must match client origin
```

### web/.env (optional)

```bash
NEXT_PUBLIC_REALTIME_WS_URL=http://localhost:8080  # Override default
```
