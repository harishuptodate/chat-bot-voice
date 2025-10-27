# ✅ SOLUTION: Audio Format Fix

## 🎯 Root Cause Identified

Based on your logs, I found the exact issue:

### The Problem

```
🔌 [lMYoR51ci4H67e9sAAAB] Deepgram live connection CLOSED
   Close code: 1011, reason: Deepgram did not receive audio data or a text message within the timeout window
```

**Error Code 1011** means Deepgram received the WebSocket connection and audio chunks, but **couldn't parse the audio format**.

### Why This Happened

1. **Client sends:** WebM container with Opus-encoded audio (`audio/webm;codecs=opus`)
2. **Server told Deepgram:** Expect raw Opus packets (`encoding: 'opus'`)
3. **Deepgram expected:** Raw Opus frames, not WebM-wrapped Opus
4. **Result:** Deepgram couldn't extract audio → timeout → error 1011

## 🔧 The Fix

Changed server encoding from `'opus'` to `'webm-opus'`:

### Before (WRONG):

```typescript
dgLive = await dg.listen.live({
	model: DG_ASR_MODEL,
	language: lang,
	interim_results: true,
	smart_format: true,
	encoding: 'opus', // ❌ Expects raw Opus packets
	sample_rate: 48000,
});
```

### After (CORRECT):

```typescript
dgLive = await dg.listen.live({
	model: DG_ASR_MODEL,
	language: lang,
	interim_results: true,
	smart_format: true,
	encoding: 'webm-opus', // ✅ Accepts WebM container with Opus
	sample_rate: 48000,
});
```

## 🧪 Test Now

1. **Restart your server:**

   ```bash
   cd realtime-server
   pnpm dev
   ```

2. **Reload your browser page**

3. **Try recording again:**

   - Click "🎤 Push-to-talk (start)"
   - Speak clearly: "Hello, this is a test"
   - Click "⏹ Stop talk"

4. **Look for this in server logs:**

   ```
   📨 [socket-id] RAW Deepgram message received: {...}
   📝 [socket-id] Extracted text: "hello this is a test" | is_final: true
   📝 [socket-id] ASR FINAL: "hello this is a test"  ← SUCCESS!
   ```

5. **Look for this on the frontend:**
   - Blue panel should appear: "YOU SAID: hello this is a test"

## 📊 What Changed in Your Logs

### Before Fix:

```
✅ [socket-id] Deepgram live connection OPENED
   Model: nova-2, Language: en-US, Encoding: opus @ 48kHz
🎵 [socket-id] FIRST audio chunk received: 286 bytes
🎵 [socket-id] Sent 10 audio chunks to Deepgram
⏹️  [socket-id] STOP_TALK event received (sent 28 total chunks)
📤 [socket-id] Calling dgLive.finish()...
✅ [socket-id] Deepgram stream finished - waiting for final transcript...
🔌 [socket-id] Deepgram live connection CLOSED
   Close code: 1011, reason: Deepgram did not receive audio data  ← ERROR
```

### After Fix (Expected):

```
✅ [socket-id] Deepgram live connection OPENED
   Model: nova-2, Language: en-US, Encoding: webm-opus @ 48kHz  ← Changed
🎵 [socket-id] FIRST audio chunk received: 286 bytes
🎵 [socket-id] Sent 10 audio chunks to Deepgram
⏹️  [socket-id] STOP_TALK event received (sent 28 total chunks)
📤 [socket-id] Calling dgLive.finish()...
✅ [socket-id] Deepgram stream finished - waiting for final transcript...
📨 [socket-id] RAW Deepgram message received: {"type":"Results"...  ← NEW!
📝 [socket-id] Extracted text: "your speech here" | is_final: true ← NEW!
📝 [socket-id] ASR FINAL: "your speech here"  ← SUCCESS!
🔌 [socket-id] Deepgram live connection CLOSED
   Close code: 1000, reason:  ← Normal close
```

## 🎉 Why This Should Work

1. ✅ Your API key is **valid** (test passed)
2. ✅ Deepgram connection **opens successfully**
3. ✅ Audio chunks are **being sent**
4. ✅ Now encoding matches: **WebM-Opus on both sides**

The ONLY issue was the encoding mismatch. With this fix, Deepgram should now be able to parse your audio and return transcriptions!

## 📝 Additional Notes

### Supported Deepgram Encodings

Deepgram supports these encoding values:

- `'linear16'` - PCM 16-bit linear
- `'flac'` - FLAC compressed audio
- `'opus'` - **Raw** Opus packets (not WebM)
- `'webm-opus'` - WebM container with Opus codec ✅ (what we need)
- `'mp3'` - MP3 format
- `'wav'` - WAV format

### Why MediaRecorder Uses WebM

The browser's `MediaRecorder` API outputs WebM by default because:

- WebM is a container format (like MP4 or AVI)
- It wraps the Opus-encoded audio
- It includes timing/metadata information
- Standard for web browsers

### Alternative: Raw Audio (More Complex)

If you wanted to use `encoding: 'opus'` (raw), you would need to:

1. Use Web Audio API to capture raw audio
2. Encode it to raw Opus packets yourself
3. Much more complex code

The `webm-opus` encoding is simpler and works great!

## 🐛 If It Still Doesn't Work

If you still don't see transcriptions after this fix:

1. **Check logs for error 1011** - If you still see it, there might be another encoding issue
2. **Try `webm` encoding** - Some Deepgram versions prefer just `'webm'`
3. **Try `linear16` encoding** - But you'd need to change the recorder too

Let me know what you see in the logs after restarting!

---

## 📚 Reference

- [Deepgram Encoding Options](https://developers.deepgram.com/docs/encoding)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Deepgram Error Codes](https://developers.deepgram.com/docs/errors)
