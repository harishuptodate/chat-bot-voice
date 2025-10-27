# Troubleshooting: No Transcription (📝 ASR FINAL not appearing)

## 🔍 Diagnosis Steps

### Step 1: Test Your Deepgram API Key

Run the test script I created:

```bash
cd realtime-server
node test-deepgram.js
```

This will test:

- ✅ API key exists
- ✅ API key format is correct
- ✅ API key is valid (can authenticate)
- ✅ Live transcription connection can be established

**Expected Output:**

```
🔍 Deepgram API Key Test
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test 1: Checking API key...
✅ PASS: API key found (abc123xyz...)
Test 2: Creating Deepgram client...
✅ PASS: Deepgram client created
Test 3: Testing API key with Deepgram API...
✅ PASS: API key is valid
Test 4: Testing live transcription connection...
✅ PASS: Live connection opened successfully
🎉 All tests passed!
```

**If this fails**, your API key is invalid. Get a new one from https://console.deepgram.com/

---

### Step 2: Check Server Logs for These Key Messages

When you test the app, look for these logs **in order**:

#### ✅ Connection Established

```
✅ WebSocket client connected: [socket-id]
🎙️  [socket-id] START event received - lang: en-US, voice: aura-asteria-en
```

#### ✅ Deepgram Connection Opened

```
✅ [socket-id] Deepgram live connection OPENED
   Model: nova-2, Language: en-US, Encoding: opus @ 48kHz
```

**If you DON'T see this**: Deepgram connection failed. Check:

- API key is correct
- Internet connection works
- No firewall blocking WebSocket connections

#### ✅ Audio Chunks Being Sent

```
🎵 [socket-id] FIRST audio chunk received: 785 bytes
🎵 [socket-id] Sent 10 audio chunks to Deepgram (latest: 804 bytes)
🎵 [socket-id] Sent 20 audio chunks to Deepgram (latest: 877 bytes)
```

**If you DON'T see this**: Audio is not being captured. Check:

- Microphone permissions in browser
- Browser console for getUserMedia errors
- Recording actually started (check browser logs)

#### ✅ Stop Signal Sent

```
⏹️  [socket-id] STOP_TALK event received (sent 47 total chunks)
📤 [socket-id] Calling dgLive.finish()...
✅ [socket-id] Deepgram stream finished - waiting for final transcript...
```

#### ✅ **CRITICAL** - Deepgram Response

```
📨 [socket-id] RAW Deepgram message received: {"type":"Results","channel_index":[0,0]...
📝 [socket-id] Extracted text: "hello how are you" | is_final: true
📝 [socket-id] ASR FINAL: "hello how are you"
```

**If you see everything above EXCEPT the Deepgram response:**

- Deepgram received the audio but couldn't transcribe it
- Possible issues:
  - Audio format incompatible
  - Audio too quiet/noisy
  - Wrong language setting
  - Account has no credits

---

### Step 3: Look for Error Messages

Check for any of these errors in server logs:

#### ❌ Deepgram Connection Error

```
❌ [socket-id] Failed to open Deepgram connection: [error details]
```

**Fix:** Check API key, internet connection

#### ❌ Deepgram ASR Error

```
❌ [socket-id] Deepgram ASR error: [error details]
```

**Fix:** This will show the specific error from Deepgram (e.g., "insufficient credits", "invalid model")

#### ❌ No Audio Chunks

```
⚠️  [socket-id] No audio chunks were sent before stop_talk!
```

**Fix:** Microphone not working or recording not started

---

## 🛠️ Common Fixes

### Fix 1: Invalid/Expired API Key

**Symptoms:**

- Test script fails at "Test 3: Testing API key"
- Error: "HTTP 401" or "HTTP 403"

**Solution:**

1. Go to https://console.deepgram.com/
2. Sign in
3. Go to "API Keys" section
4. Create a new API key
5. Copy the key
6. Update `realtime-server/.env`:
   ```bash
   DEEPGRAM_API_KEY=your_new_key_here
   ```
7. Restart server

---

### Fix 2: No Credits / Free Tier Exhausted

**Symptoms:**

- Connection opens successfully
- Audio chunks are sent
- But no transcription comes back
- OR Error: "insufficient credits"

**Solution:**

1. Go to https://console.deepgram.com/
2. Check "Billing" section
3. Add credits or upgrade account
4. Deepgram gives $200 free credits initially

---

### Fix 3: Audio Format Issue

**Symptoms:**

- Everything works up to finish()
- But no transcription received
- No error messages

**Solution:** Try changing audio encoding in `realtime-server/src/index.ts`:

**Current (line ~65-71):**

```typescript
dgLive = await dg.listen.live({
	model: DG_ASR_MODEL,
	language: lang,
	interim_results: true,
	smart_format: true,
	encoding: 'opus', // <-- Try changing this
	sample_rate: 48000, // <-- And this
});
```

**Try Option 1 - Linear16:**

```typescript
dgLive = await dg.listen.live({
	model: DG_ASR_MODEL,
	language: lang,
	interim_results: true,
	smart_format: true,
	encoding: 'linear16', // Changed
	sample_rate: 16000, // Changed
});
```

**Note:** If you change encoding, you also need to change the recorder in `web/lib/audio/recorder.ts` to match.

---

### Fix 4: Microphone Permissions

**Symptoms:**

- "Push-to-talk" button clicked
- But no "FIRST audio chunk received" log appears
- Browser console shows getUserMedia error

**Solution:**

1. Check browser address bar for blocked microphone icon
2. Click and allow microphone access
3. Reload page and try again

---

### Fix 5: Wrong Model or Language

**Symptoms:**

- Everything seems to work
- But specific words or languages don't transcribe

**Solution:** Change model in `realtime-server/.env`:

```bash
# Try different models
DG_ASR_MODEL=nova-2        # Good for most use cases (default)
DG_ASR_MODEL=nova          # Older but stable
DG_ASR_MODEL=base          # Basic model
DG_ASR_MODEL=enhanced      # Higher accuracy, more expensive
```

For non-English, make sure you change language in the client too:

```typescript
socket.emit('start', { lang: 'es', voice: 'aura-asteria-en' }); // Spanish
```

---

## 📊 Detailed Logging Added

I've added extensive logging to help diagnose. Here's what each log means:

### Server Logs Explained

| Log                                  | Meaning                           | If Missing                    |
| ------------------------------------ | --------------------------------- | ----------------------------- |
| `✅ Deepgram live connection OPENED` | Deepgram WebSocket connected      | Check API key, internet       |
| `🎵 FIRST audio chunk received`      | First audio received from browser | Check microphone, recording   |
| `📨 RAW Deepgram message received`   | Deepgram sent a response          | Deepgram is working!          |
| `📝 Extracted text: "..."`           | Text was extracted from response  | If empty, audio quality issue |
| `📝 ASR FINAL: "..."`                | Final transcription ready         | This is what you want to see! |

---

## 🎯 Quick Diagnostic Checklist

Run through this checklist and note where it fails:

- [ ] 1. Test script passes (`node test-deepgram.js`)
- [ ] 2. Server starts without errors
- [ ] 3. Browser connects (`✅ WebSocket CONNECTED`)
- [ ] 4. START event received
- [ ] 5. Deepgram connection opens
- [ ] 6. Click "Push-to-talk"
- [ ] 7. Speak clearly for 3-5 seconds
- [ ] 8. See "FIRST audio chunk" log
- [ ] 9. See periodic "Sent N chunks" logs
- [ ] 10. Click "Stop talk"
- [ ] 11. See "STOP_TALK event" log
- [ ] 12. See "dgLive.finish()" log
- [ ] 13. See "RAW Deepgram message" log ← **CRITICAL**
- [ ] 14. See "ASR FINAL" log ← **SUCCESS**

**Share which step fails** and I can help you fix it!

---

## 🔬 Advanced Debugging

If all else fails, add this temporary code to see ALL Deepgram events:

In `realtime-server/src/index.ts`, after line 72 (after creating dgLive), add:

```typescript
// Log ALL events from Deepgram
dgLive.addListener('Metadata', (data: any) => {
	console.log('🔍 Deepgram Metadata:', data);
});

dgLive.addListener('UtteranceEnd', (data: any) => {
	console.log('🔍 Deepgram UtteranceEnd:', data);
});

dgLive.addListener('SpeechStarted', (data: any) => {
	console.log('🔍 Deepgram SpeechStarted:', data);
});
```

This will show you EVERYTHING Deepgram sends, which can help diagnose why transcription isn't working.

---

## 📞 Still Not Working?

If you've gone through all these steps and it still doesn't work, share:

1. **Output of test script:** `node test-deepgram.js`
2. **Server logs:** From when you start talking to when you stop
3. **Browser console logs:** Any errors or warnings
4. **Which step in the checklist fails:** The specific step number

This will help me pinpoint the exact issue!
