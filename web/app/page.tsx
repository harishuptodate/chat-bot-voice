'use client';
import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket';
import { createRecorder } from '../lib/audio/recorder';
import { StreamPlayer } from '../lib/audio/player';

export default function VoicePage() {
	const [status, setStatus] = useState<'idle' | 'listening' | 'speaking'>(
		'idle',
	);
	const [partial, setPartial] = useState('');
	const [finalText, setFinalText] = useState('');
	const [assistantCaption, setAssistantCaption] = useState('');
	const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);
	const recRef = useRef<MediaRecorder | null>(null);
	const playerRef = useRef<StreamPlayer | null>(null);

	useEffect(() => {
		const socket = getSocket();
		socketRef.current = socket;

		socket.on('connect', () => {
			console.log('✅ WebSocket CONNECTED - Socket ID:', socket.id);
			// Start ASR only when user presses Push-to-talk to avoid duplicate sessions
		});

		socket.on('asr_partial', ({ text }: { text: string }) => {
			console.log('📝 ASR PARTIAL received:', text);
			setPartial(text);
		});

		socket.on('asr_final', ({ text }: { text: string }) => {
			console.log('✅ ASR FINAL received:', text);
			setFinalText(text);
			setPartial('');
			setStatus('speaking');
			// request LLM -> TTS
			console.log('🤖 Sending AGENT_REPLY to server with text:', text);
			socket.emit('agent_reply', { text });
		});

		socket.on('thinking', () => {
			console.log('💭 AI is thinking...');
		});

		socket.on('reply_text', ({ text }: { text: string }) => {
			console.log('💬 AI REPLY TEXT received:', text);
			setAssistantCaption(text);
		});

		socket.on('tts_chunk', (binary: ArrayBuffer) => {
			console.log('🔊 TTS CHUNK received, size:', binary.byteLength);
			if (!playerRef.current) {
				playerRef.current = new StreamPlayer();
				document.body.appendChild(playerRef.current.element);
				console.log('🎵 StreamPlayer created and added to DOM');
			}
			playerRef.current.append(binary);
		});

		socket.on('tts_done', () => {
			// End the stream so MediaSource can flush
			try {
				playerRef.current?.end();
			} catch {}
			console.log('✅ TTS DONE - Audio playback complete');
			setStatus('idle');
			setAssistantCaption('');
		});

		socket.on('error', (e: any) => {
			console.error('❌ Server error:', e);
		});

		socket.on('connect_error', (error: any) => {
			console.error('❌ Connection error:', error);
		});

		socket.on('disconnect', (reason: string) => {
			console.warn('⚠️  Disconnected:', reason);
		});

		// Manually connect to the socket
		if (!socket.connected) {
			console.log('🔌 Attempting to connect to WebSocket server...');
			socket.connect();
		}

		return () => {
			// socket.disconnect();
			console.log('🧹 Cleaning up socket listeners');
		};
	}, []);

	const startPTT = async () => {
		console.log('🎤 Push-to-talk STARTED');
		if (status === 'speaking') {
			// barge-in
			console.log('⚠️  Barge-in: Canceling current TTS');
			socketRef.current?.emit('cancel_tts');
		}
		// Tell server to start ASR session now
		socketRef.current?.emit('start', {
			lang: 'en-US',
			voice: 'aura-asteria-en',
		});
		console.log('🎙️  Sent START event to server');
		let chunkCount = 0;
		const rec = await createRecorder((buf: ArrayBuffer) => {
			chunkCount++;
			// Log every 10th chunk to avoid flooding console
			if (chunkCount % 10 === 0) {
				console.log(
					`🎵 Sent ${chunkCount} audio chunks to server (latest: ${buf.byteLength} bytes)`,
				);
			}
			socketRef.current?.emit('audio_chunk', buf);
		});
		recRef.current = rec;
		rec.start(200); // send ~200ms chunks (suitable for 16k PCM)
		setStatus('listening');
		console.log('👂 Now LISTENING - Recording started');
	};

	const stopPTT = () => {
		console.log('⏹️  Push-to-talk STOPPED');
		try {
			if (recRef.current) {
				recRef.current.stop();
				const stream = (recRef.current as any).stream as
					| MediaStream
					| undefined;
				stream?.getTracks()?.forEach((t) => t.stop());
				recRef.current = null;
				console.log('✅ Recording stopped and stream closed');
			}
		} finally {
			setStatus('idle');
			console.log('📤 Sending STOP_TALK to server');
			socketRef.current?.emit('stop_talk');
		}
	};

	return (
		<main className="mx-auto mt-6 max-w-5xl rounded-2xl border border-white/10 bg-white/5 p-7 shadow-2xl backdrop-blur-xl">
			<h1 className="mb-2 text-2xl font-semibold tracking-wide text-white">
				Voice Chat (Deepgram + Gemini)
			</h1>
			<div className="mt-2 text-sm text-slate-300">
				WS:{' '}
				<span
					className={`ml-2 inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
						socketRef.current?.connected
							? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
							: 'border-amber-400/30 bg-amber-500/15 text-amber-300'
					}`}>
					{socketRef.current?.connected ? 'connected' : 'connecting...'}
				</span>
			</div>
			<div className="mt-2 text-sm text-slate-300">
				Status:{' '}
				<span
					className={`ml-2 inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
						status === 'listening'
							? 'border-indigo-400/35 bg-indigo-400/15 text-indigo-200'
							: status === 'speaking'
							? 'border-violet-400/35 bg-violet-400/15 text-violet-200'
							: 'border-slate-500/35 bg-slate-700/30 text-slate-300'
					}`}>
					{status}
				</span>
			</div>

			{/* Debug Display - Shows what user said */}
			{(partial || finalText) && (
				<div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
					<div className="text-xs font-semibold text-blue-300 mb-1">
						YOU SAID:
					</div>
					<div className="text-sm text-white">
						{partial ? (
							<span className="text-blue-200 italic">
								{partial} (partial...)
							</span>
						) : (
							<span className="text-white font-semibold">{finalText}</span>
						)}
					</div>
				</div>
			)}

			{/* Debug Display - Shows AI response */}
			{assistantCaption && (
				<div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
					<div className="text-xs font-semibold text-emerald-300 mb-1">
						AI SAYS:
					</div>
					<div className="text-sm text-white font-semibold">
						{assistantCaption}
					</div>
				</div>
			)}

			<div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
				<div className="relative flex min-h-[220px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-6">
					<div
						className={`grid h-24 w-24 place-items-center rounded-full bg-gradient-to-tr from-indigo-400 to-violet-400 font-extrabold tracking-wide text-slate-900 shadow-inner ${
							status === 'listening'
								? 'animate-pulse ring-2 ring-violet-300/60'
								: ''
						}`}>
						You
					</div>
					<div className="mt-4 max-w-[80%] rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm leading-snug text-slate-100 backdrop-blur-md">
						{partial || finalText || 'Say something to start...'}
					</div>
				</div>
				<div className="relative flex min-h-[220px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-6">
					<div
						className={`grid h-24 w-24 place-items-center rounded-full bg-gradient-to-tr from-emerald-400 to-teal-300 font-extrabold tracking-wide text-slate-900 shadow-inner ${
							status === 'speaking'
								? 'animate-pulse ring-2 ring-emerald-300/60'
								: ''
						}`}>
						AI
					</div>
					<div className="mt-4 max-w-[80%] rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm leading-snug text-emerald-100 backdrop-blur-md">
						{assistantCaption || (status === 'speaking' ? '...' : '')}
					</div>
				</div>
			</div>

			<div className="mt-5">
				<button
					className="mr-2 rounded-xl border border-white/20 bg-gradient-to-tr from-indigo-400 to-violet-400 px-4 py-2 font-semibold text-slate-900 hover:brightness-105"
					onClick={startPTT}>
					🎤 Push-to-talk (start)
				</button>
				<button
					className="mr-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 font-semibold text-slate-200 hover:bg-slate-700"
					onClick={stopPTT}>
					⏹ Stop talk
				</button>
				{status === 'speaking' && (
					<button
						className="rounded-xl border border-white/20 bg-gradient-to-tr from-rose-500 to-amber-500 px-4 py-2 font-semibold text-rose-900 hover:brightness-105"
						onClick={() => socketRef.current?.emit('cancel_tts')}>
						⏹ Barge-in
					</button>
				)}
			</div>

			<div className="mt-5 h-2 animate-pulse rounded-full bg-[linear-gradient(90deg,rgba(99,102,241,0.3),rgba(167,139,250,0.45),rgba(99,102,241,0.3))] bg-[length:200%_100%] shadow-inner" />
		</main>
	);
}
