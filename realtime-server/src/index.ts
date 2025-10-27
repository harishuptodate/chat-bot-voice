import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { LiveTranscriptionEvents, createClient } from '@deepgram/sdk';
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
	console.log('✅ WebSocket client connected:', socket.id);

	let dgLive: DGStream | null = null;
	let ttsAbort: AbortController | null = null;
	let ttsQueue: string[] = [];
	let ttsPlaying = false;

	const stopAnyTTS = () => {
		if (ttsAbort) {
			try {
				ttsAbort.abort();
			} catch {}
			ttsAbort = null;
		}
		ttsQueue = [];
		ttsPlaying = false;
		socket.emit('tts_done');
	};

	async function speakSentence(sentence: string, voice?: string) {
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
		if (!res.ok || !res.body) return;
		for await (const chunk of res.body as any) {
			socket.emit('tts_chunk', Buffer.from(chunk));
		}
	}

	async function processTTSQueue(voice?: string) {
		if (ttsPlaying) return;
		ttsPlaying = true;
		try {
			while (ttsQueue.length > 0) {
				const s = ttsQueue.shift();
				if (!s) continue;
				await speakSentence(s, voice);
				await new Promise((r) => setTimeout(r, 50));
			}
		} finally {
			ttsAbort = null;
			ttsPlaying = false;
			socket.emit('tts_done');
		}
	}

	socket.on(
		'start',
		async ({ lang = 'en-US', voice }: { lang?: string; voice?: string }) => {
			console.log(
				`🎙️  [${socket.id}] START event received - lang: ${lang}, voice: ${voice}`,
			);
			// If a previous Deepgram stream exists, finish/close it to avoid leaks
			if (dgLive) {
				try {
					(dgLive as any).finish?.();
				} catch {}
				try {
					(dgLive as any).close?.();
				} catch {}
				dgLive = null;
				console.log(
					`♻️  [${socket.id}] Closed previous Deepgram stream before starting new one`,
				);
			}
			try {
				// Configure Deepgram to expect 16kHz linear PCM mono audio
				dgLive = dg.listen.live({
					model: DG_ASR_MODEL,
					language: lang,
					interim_results: true,
					smart_format: true,
					encoding: 'linear16',
					sample_rate: 16000,
					channels: 1,
				});

				dgLive.on(LiveTranscriptionEvents.Open, () => {
					console.log(`✅ [${socket.id}] Deepgram live connection OPENED`);
					console.log(
						`   Model: ${DG_ASR_MODEL}, Language: ${lang}, Encoding: linear16 @ 16kHz (mono)`,
					);
				});

				dgLive.on(LiveTranscriptionEvents.Transcript, (msg: any) => {
					console.log(
						`📨 [${socket.id}] RAW Deepgram message received:`,
						JSON.stringify(msg).substring(0, 200),
					);
					const alt = msg?.channel?.alternatives?.[0];
					const text = alt?.transcript || '';
					console.log(
						`📝 [${socket.id}] Extracted text: "${text}" | is_final: ${msg.is_final}`,
					);
					if (!text) {
						console.log(`⚠️  [${socket.id}] Empty transcript, skipping...`);
						return;
					}
					if (msg.is_final) {
						console.log(`📝 [${socket.id}] ASR FINAL: "${text}"`);
						socket.emit('asr_final', { text });
					} else {
						console.log(`📝 [${socket.id}] ASR PARTIAL: "${text}"`);
						socket.emit('asr_partial', { text });
					}
				});

				dgLive.addListener('error', (e: any) => {
					console.error(`❌ [${socket.id}] Deepgram ASR error:`, e);
					console.error(`   Error details:`, JSON.stringify(e, null, 2));
					socket.emit('error', {
						code: 'DG_ASR',
						message: e?.message || String(e),
					});
				});

				dgLive.addListener('close', (closeEvent: any) => {
					console.log(`🔌 [${socket.id}] Deepgram live connection CLOSED`);
					if (closeEvent) {
						console.log(
							`   Close code: ${closeEvent.code}, reason: ${closeEvent.reason}`,
						);
					}
				});
			} catch (e: any) {
				console.error(
					`❌ [${socket.id}] Failed to open Deepgram connection:`,
					e,
				);
				socket.emit('error', {
					code: 'DG_ASR_OPEN',
					message: e?.message || String(e),
				});
			}
		},
	);

	let audioChunkCount = 0;
	let firstChunkReceived = false;
	socket.on('audio_chunk', async (buf: ArrayBuffer) => {
		if (!dgLive) {
			console.warn(
				`⚠️  [${socket.id}] Received audio_chunk but dgLive is not initialized`,
			);
			return;
		}
		try {
			dgLive.send(Buffer.from(buf));
			audioChunkCount++;

			// Log first chunk with details
			if (!firstChunkReceived) {
				console.log(
					`🎵 [${socket.id}] FIRST audio chunk received: ${buf.byteLength} bytes`,
				);
				firstChunkReceived = true;
			}

			// Log every 10th chunk to avoid flooding console
			if (audioChunkCount % 10 === 0) {
				console.log(
					`🎵 [${socket.id}] Sent ${audioChunkCount} audio chunks to Deepgram (latest: ${buf.byteLength} bytes)`,
				);
			}
		} catch (e) {
			console.error(`❌ [${socket.id}] Error sending audio chunk:`, e);
		}
	});

	socket.on('stop_talk', async () => {
		console.log(
			`⏹️  [${socket.id}] STOP_TALK event received (sent ${audioChunkCount} total chunks)`,
		);
		const totalChunks = audioChunkCount;
		audioChunkCount = 0; // Reset counter
		firstChunkReceived = false; // Reset flag

		if (!dgLive) {
			console.warn(`⚠️  [${socket.id}] Cannot finish - dgLive is null`);
			return;
		}

		if (totalChunks === 0) {
			console.warn(
				`⚠️  [${socket.id}] No audio chunks were sent before stop_talk!`,
			);
		}

		try {
			// Send finish signal to Deepgram to finalize transcription
			console.log(`📤 [${socket.id}] Calling dgLive.finalize()...`);
			await dgLive.finalize?.();
			console.log(
				`✅ [${socket.id}] Deepgram stream finished - waiting for final transcript...`,
			);
		} catch (e) {
			console.error(`❌ [${socket.id}] Error finishing Deepgram:`, e);
		}
	});

	socket.on('cancel_tts', () => {
		stopAnyTTS();
	});

	// When the client/UI decides to create a reply from the latest asr_final
	socket.on(
		'agent_reply',
		async ({ text, voice }: { text: string; voice?: string }) => {
			console.log(`🤖 [${socket.id}] AGENT_REPLY event - User said: "${text}"`);
			if (!text || !text.trim()) {
				console.warn(`⚠️  [${socket.id}] Empty text received for agent_reply`);
				return;
			}

			// 1) Stream Gemini tokens
			socket.emit('thinking');
			console.log(`💭 [${socket.id}] Sent 'thinking' event to client`);
			let buffer = '';
			let spoken = '';

			const flushSentenceToTTS = async (sentence: string) => {
				if (!sentence.trim()) return;
				console.log(`🔊 [${socket.id}] Converting to speech: "${sentence}"`);
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
					console.error(`❌ [${socket.id}] TTS API error: HTTP ${res.status}`);
					socket.emit('error', {
						code: 'DG_TTS',
						message: `HTTP ${res.status}`,
					});
					return;
				}
				if (!res.body) {
					console.warn(`⚠️  [${socket.id}] TTS response has no body`);
					return;
				}

				// stream chunks to client immediately
				let chunkCount = 0;
				for await (const chunk of res.body as any) {
					socket.emit('tts_chunk', Buffer.from(chunk));
					chunkCount++;
				}
				console.log(
					`✅ [${socket.id}] TTS complete - sent ${chunkCount} audio chunks`,
				);
				socket.emit('tts_done');
				ttsAbort = null;
			};

			try {
				console.log(`🧠 [${socket.id}] Starting Gemini stream...`);
				for await (const piece of streamGeminiReply(text)) {
					buffer += piece;
					console.log(`🧠 [${socket.id}] Gemini chunk: "${piece}"`);
					// naive sentence splitting; improve with an sbd lib if needed
					let m: RegExpExecArray | null;
					const re = /([^.!?\n]+[.!?])(\s|$)/g;
					while ((m = re.exec(buffer))) {
						const sentence = m[1];
						console.log(`💬 [${socket.id}] Sending reply_text: "${sentence}"`);
						socket.emit('reply_text', { text: sentence }); // optional captions
						spoken += sentence + ' ';
					}
					// keep only trailing fragment
					buffer = buffer.replace(/([^.!?\n]+[.!?])(\s|$)/g, '');
				}
				if (buffer.trim()) {
					const tail = buffer.trim();
					console.log(`💬 [${socket.id}] Sending final reply_text: "${tail}"`);
					socket.emit('reply_text', { text: tail });
					spoken += tail;
				}
				// Speak only once: the full composed sentence(s)
				const toSpeak = spoken.trim();
				if (toSpeak) {
					await flushSentenceToTTS(toSpeak);
				}
				console.log(`✅ [${socket.id}] Agent reply complete`);
			} catch (e: any) {
				if (e?.name === 'AbortError') {
					console.log(`⚠️  [${socket.id}] TTS aborted (barge-in)`);
					return; // canceled (barge-in)
				}
				console.error(`❌ [${socket.id}] LLM stream error:`, e);
				socket.emit('error', {
					code: 'LLM_STREAM',
					message: e?.message || String(e),
				});
			}
		},
	);

	socket.on('disconnect', () => {
		console.log(`🔌 [${socket.id}] Client disconnected`);
		try {
			dgLive?.close();
		} catch {}
		stopAnyTTS();
	});
});

server.listen(PORT, () => {
	console.log(`Realtime server listening on :${PORT}`);
});
