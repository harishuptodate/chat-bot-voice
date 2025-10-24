# WebSocket Connection Troubleshooting Guide

## 🔴 Issues Found & Fixed

### 1. **Missing Environment Variables (CRITICAL)**
- **Problem**: `.env` files were missing, causing the server to fail silently
- **Solution**: Create `.env` files in both directories with required variables

### 2. **Incorrect Deepgram TTS API URL**
- **Problem**: URL was `https://api.createClient.com/v1/speak` (invalid)
- **Fix**: Changed to `https://api.deepgram.com/v1/speak` ✅

### 3. **API Key Exposed in Logs**
- **Problem**: `console.log(DG_KEY)` was logging sensitive data
- **Fix**: Removed the log statement ✅

### 4. **Socket Not Connecting**
- **Problem**: Client was not explicitly calling `.connect()`
- **Fix**: Added explicit `socket.connect()` call in useEffect ✅

---

## 🔧 Setup Instructions

### **Step 1: Set Up Backend Environment**

Create `/realtime-server/.env`:
```bash
# Required: Get from https://console.deepgram.com
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Optional: Already have defaults
DG_ASR_MODEL=nova-2
DG_TTS_VOICE=aura-asteria-en

# Server
PORT=8080
CORS_ORIGINS=http://localhost:3000

# Required: Get from https://makersuite.google.com/app/apikeys
GOOGLE_GEMINI_API_KEY=your_google_gemini_api_key_here
```

### **Step 2: Set Up Frontend Environment**

Create `/web/.env.local`:
```bash
NEXT_PUBLIC_REALTIME_WS_URL=http://localhost:8080
```

### **Step 3: Install Dependencies**

```bash
# Backend
cd realtime-server
pnpm install

# Frontend  
cd ../web
pnpm install
```

### **Step 4: Start the Servers**

**Terminal 1 - Backend:**
```bash
cd realtime-server
pnpm dev
# Should see: ✅ Deepgram client initialized
# Should see: ✅ Realtime server listening on :8080
```

**Terminal 2 - Frontend:**
```bash
cd web
pnpm dev
# Should see: ✅ Next.js running on http://localhost:3000
```

---

## 🧪 Testing with Postman/Tools

### **Test 1: Server Health Check**
```bash
curl http://localhost:8080/health
# Should return: {"ok":true}
```

### **Test 2: WebSocket Connection (using wscat)**
```bash
npm install -g wscat
wscat -c http://localhost:8080/socket.io/?EIO=4&transport=websocket

# You should see connection logs in both terminals
```

### **Test 3: Browser DevTools**
1. Open http://localhost:3000/voice
2. Open DevTools (F12) → Console tab
3. Check for logs:
   - 🔌 Attempting to connect to WebSocket server...
   - ✅ WebSocket client connected: [socket-id]

---

## 📊 Expected Console Output

### **Backend (realtime-server)**
```
✅ Deepgram client initialized
✅ Realtime server listening on :8080
✅ WebSocket client connected: abc123xyz
```

### **Frontend (web)**
```
socket:  Socket {id: 'abc123xyz', ...}
🔌 Attempting to connect to WebSocket server...
connected
```

---

## 🚨 Common Issues & Solutions

### Issue: "Cannot GET /socket.io/"
- **Cause**: Server not running on port 8080
- **Solution**: Check if `pnpm dev` is running in realtime-server

### Issue: "Connection refused on localhost:8080"
- **Cause**: Backend not started
- **Solution**: Run `cd realtime-server && pnpm dev`

### Issue: "DEEPGRAM_API_KEY is not set"
- **Cause**: Missing `.env` file
- **Solution**: Create `/realtime-server/.env` with API keys

### Issue: Socket shows "connecting..." but never connects
- **Cause**: CORS issue or .env not loaded
- **Solution**: 
  1. Check CORS_ORIGINS matches your frontend URL
  2. Restart backend after editing .env
  3. Check browser DevTools Network tab for WebSocket connection

### Issue: TTS fails with 400 error
- **Cause**: Invalid voice model or API key
- **Solution**: Verify DG_TTS_VOICE is valid (e.g., `aura-asteria-en`)

---

## 🔍 Debugging Checklist

- [ ] Backend `.env` file exists and has `DEEPGRAM_API_KEY`
- [ ] Frontend `.env.local` has `NEXT_PUBLIC_REALTIME_WS_URL`
- [ ] Backend running: `pnpm dev` in realtime-server
- [ ] Frontend running: `pnpm dev` in web directory
- [ ] Health check passes: `curl http://localhost:8080/health`
- [ ] Browser console shows "✅ WebSocket client connected"
- [ ] Deepgram API key is valid
- [ ] Google Gemini API key is valid (for LLM responses)

---

## 📱 Mobile/Remote Testing

If connecting from a different machine:

1. **Update frontend .env:**
```bash
NEXT_PUBLIC_REALTIME_WS_URL=http://your-server-ip:8080
```

2. **Update backend CORS:**
```bash
CORS_ORIGINS=http://your-client-ip:3000,http://localhost:3000
```

3. **Restart both servers**

