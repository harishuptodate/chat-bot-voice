import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { createClient } from '@deepgram/sdk';
import fetch from 'node-fetch';
import { geminiModel, streamGeminiReply } from './gemini.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000')
	.split(',')
	.map((s) => s.trim());

const DG_KEY = process.env.DEEPGRAM_API_KEY!;
const DG_ASR_MODEL = process.env.DG_ASR_MODEL || 'nova-2';
const DG_TTS_VOICE = process.env.DG_TTS_VOICE || 'aura-asteria-en';

const app = express();
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.get('/health', (_req, res) => res.json({ ok: true }));

// Validate environment variables
if (!DG_KEY) {
	console.error('❌ FATAL: DEEPGRAM_API_KEY is not set in .env file');
	process.exit(1);
}

const server = http.createServer(app);
const io = new Server(server, {
	cors: { origin: '*', credentials: true },
	maxHttpBufferSize: 1e7, // ~10MB
});
const dg = createClient(DG_KEY);
console.log('✅ Deepgram client initialized');

type DGStream = ReturnType<typeof dg.listen.live> extends Promise<infer P>
	? P
	: any;

io.on('connection', (socket) => {
	console.log("✅ WebSocket client connected:", socket.id);
	
	let dgLive: DGStream | null = null;
	let ttsAbort: AbortController | null = null;

	const stopAnyTTS = () => {
		if (ttsAbort) {
			try {
				ttsAbort.abort();
			} catch {}
			ttsAbort = null;
		}
		socket.emit('tts_done');
	};

	socket.on(
		'start',
		async ({ lang = 'en-US', voice }: { lang?: string; voice?: string }) => {
			try {
				dgLive = await dg.listen.live({
					model: DG_ASR_MODEL,
					language: lang,
					interim_results: true,
					smart_format: true,
					encoding: 'opus',
					sample_rate: 48000,
				});

				dgLive.addListener('open', () => console.log('createClient live open'));

				dgLive.addListener('transcriptReceived', (msg: any) => {
					const alt = msg?.channel?.alternatives?.[0];
					const text = alt?.transcript || '';
					if (!text) return;
					if (msg.is_final) socket.emit('asr_final', { text });
					else socket.emit('asr_partial', { text });
				});

				dgLive.addListener('error', (e: any) => {
					socket.emit('error', {
						code: 'DG_ASR',
						message: e?.message || String(e),
					});
				});

				dgLive.addListener('close', () =>
					console.log('createClient live closed'),
				);
			} catch (e: any) {
				socket.emit('error', {
					code: 'DG_ASR_OPEN',
					message: e?.message || String(e),
				});
			}
		},
	);

	socket.on('audio_chunk', async (buf: ArrayBuffer) => {
		if (!dgLive) return;
		try {
			dgLive.send(Buffer.from(buf));
		} catch {}
	});

	socket.on('stop_talk', async () => {
		if (!dgLive) return;
		try {
			dgLive.flush();
		} catch {}
	});

	socket.on('cancel_tts', () => {
		stopAnyTTS();
	});

	// When the client/UI decides to create a reply from the latest asr_final
	socket.on(
		'agent_reply',
		async ({ text, voice }: { text: string; voice?: string }) => {
			if (!text || !text.trim()) return;

			// 1) Stream Gemini tokens
			socket.emit('thinking');
			let buffer = '';

			const flushSentenceToTTS = async (sentence: string) => {
				if (!sentence.trim()) return;
				// cancel previous TTS if you want utterance-at-a-time policy
				stopAnyTTS();
				ttsAbort = new AbortController();

				const url = `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(
					voice || DG_TTS_VOICE,
				)}`;
				const res = await fetch(url, {
					method: 'POST',
					headers: {
						Authorization: `Token ${DG_KEY}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ text: sentence }),
					signal: ttsAbort.signal,
				});
				if (!res.ok) {
					socket.emit('error', {
						code: 'DG_TTS',
						message: `HTTP ${res.status}`,
					});
					return;
				}
				if (!res.body) return;

				// stream chunks to client immediately
				for await (const chunk of res.body as any) {
					socket.emit('tts_chunk', Buffer.from(chunk));
				}
				socket.emit('tts_done');
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
						socket.emit('reply_text', { text: sentence }); // optional captions
						await flushSentenceToTTS(sentence);
					}
					// keep only trailing fragment
					buffer = buffer.replace(/([^.!?\n]+[.!?])(\s|$)/g, '');
				}
				if (buffer.trim()) {
					socket.emit('reply_text', { text: buffer.trim() });
					await flushSentenceToTTS(buffer.trim());
				}
			} catch (e: any) {
				if (e?.name === 'AbortError') return; // canceled (barge-in)
				socket.emit('error', {
					code: 'LLM_STREAM',
					message: e?.message || String(e),
				});
			}
		},
	);

	socket.on('disconnect', () => {
		try {
			dgLive?.close();
		} catch {}
		stopAnyTTS();
	});
});

server.listen(PORT, () => {
	console.log(`Realtime server listening on :${PORT}`);
});
