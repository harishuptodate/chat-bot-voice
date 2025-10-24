// Streaming MP3/OGG with MediaSource for smooth playback
export class StreamPlayer {
	private mediaSource: MediaSource;
	private audio: HTMLAudioElement;
	private sourceBuffer: SourceBuffer | null = null;
	private queue: Uint8Array[] = [];
	private mime = 'audio/mpeg'; // Deepgram can return chunked MPEG; adjust if needed

	constructor(el?: HTMLAudioElement) {
		this.audio = el || new Audio();
		this.audio.autoplay = true;
		this.mediaSource = new MediaSource();
		this.audio.src = URL.createObjectURL(this.mediaSource);

		this.mediaSource.addEventListener('sourceopen', () => {
			if (!MediaSource.isTypeSupported(this.mime)) {
				console.warn('MIME not supported for MediaSource:', this.mime);
				return;
			}
			this.sourceBuffer = this.mediaSource.addSourceBuffer(this.mime);
			this.sourceBuffer.mode = 'sequence';
			this.sourceBuffer.addEventListener('updateend', () => this.drain());
			this.drain();
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
				this.sourceBuffer.appendBuffer(next.buffer as ArrayBuffer);
			} catch (e) {
				console.warn('appendBuffer error', e);
			}
		}
	}

	end() {
		try {
			this.mediaSource.endOfStream();
		} catch {}
	}

	get element() {
		return this.audio;
	}
}
