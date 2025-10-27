// Streaming MP3/OGG with MediaSource for smooth playback
export class StreamPlayer {
	private mediaSource: MediaSource;
	private audio: HTMLAudioElement;
	private sourceBuffer: SourceBuffer | null = null;
	private queue: Uint8Array[] = [];
	private mime = 'audio/webm;codecs=opus'; // Expecting WebM/Opus chunks from Deepgram
	private endRequested = false;
	private started = false;

	constructor(el?: HTMLAudioElement) {
		this.audio = el || new Audio();
		this.audio.autoplay = true;
		(this.audio as any).playsInline = true;
		this.mediaSource = new MediaSource();
		this.attachMediaSource();
	}

	private attachMediaSource() {
		this.audio.src = URL.createObjectURL(this.mediaSource);
		this.mediaSource.addEventListener('sourceopen', () => {
			// Guard against adding more than one SourceBuffer
			if (this.sourceBuffer) return;
			if (!MediaSource.isTypeSupported(this.mime)) {
				console.warn('MIME not supported for MediaSource:', this.mime);
				return;
			}
			try {
				this.sourceBuffer = this.mediaSource.addSourceBuffer(this.mime);
				this.sourceBuffer.mode = 'sequence';
				this.sourceBuffer.addEventListener('updateend', () => this.drain());
				this.drain();
			} catch (e) {
				console.warn('addSourceBuffer failed', e);
			}
		});
	}

	append(chunk: ArrayBuffer) {
		this.queue.push(new Uint8Array(chunk));
		this.drain();
	}

	private drain() {
		if (!this.sourceBuffer || this.sourceBuffer.updating) return;
		const next = this.queue.shift();
		if (next) {
			try {
				// Append only the view range, not the entire underlying buffer
				const slice = next.buffer.slice(
					next.byteOffset,
					next.byteOffset + next.byteLength,
				) as ArrayBuffer;
				this.sourceBuffer.appendBuffer(slice as ArrayBuffer);
				if (!this.started) {
					this.started = true;
					this.audio.play().catch(() => {});
				}
			} catch (e) {
				console.warn('appendBuffer error', e);
			}
		}
		if (!next && this.endRequested) {
			try {
				this.mediaSource.endOfStream();
			} catch {}
			this.endRequested = false;
			this.started = false;
		}
	}

	end() {
		// mark for graceful end after queued data appended
		this.endRequested = true;
		this.drain();
		setTimeout(() => {
			try {
				URL.revokeObjectURL(this.audio.src);
			} catch {}
			this.sourceBuffer = null;
			this.queue = [];
			this.mediaSource = new MediaSource();
			this.attachMediaSource();
		}, 0);
	}

	get element() {
		return this.audio;
	}
}
