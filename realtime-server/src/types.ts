export type ServerToClient = {
	asr_partial: (payload: {
		text: string;
		start?: number;
		end?: number;
	}) => void;
	asr_final: (payload: { text: string; start?: number; end?: number }) => void;
	thinking: () => void;
	reply_text: (payload: { text: string }) => void; // optional captions
	tts_chunk: (payload: ArrayBuffer) => void;
	tts_done: () => void;
	error: (payload: { code: string; message?: string }) => void;
};

export type ClientToServer = {
	start: (payload: {
		sessionId?: string;
		lang?: string;
		voice?: string;
	}) => void;
	audio_chunk: (payload: ArrayBuffer) => void; // WebM/Opus 48k frames
	stop_talk: () => void; // user/VAD says turn ended
	cancel_tts: () => void; // barge-in
};
