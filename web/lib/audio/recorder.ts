// Create a PCM recorder that streams 16kHz linear16 PCM buffers
export async function createRecorder(onChunk: (buf: ArrayBuffer) => void) {
	const stream = await navigator.mediaDevices.getUserMedia({
		audio: {
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true,
			channelCount: 1,
		},
	});

	const audioContext = new (window.AudioContext ||
		(window as any).webkitAudioContext)();
	const source = audioContext.createMediaStreamSource(stream);
	const processor = audioContext.createScriptProcessor(4096, 1, 1);

	const inputSampleRate = audioContext.sampleRate; // typically 48000
	const targetSampleRate = 16000;
	let isRunning = false;
	let floatBuffer: Float32Array[] = [];
	let flushTimer: number | null = null;

	processor.onaudioprocess = (event) => {
		if (!isRunning) return;
		const input = event.inputBuffer.getChannelData(0);
		// Copy the buffer because the underlying memory can be reused
		floatBuffer.push(new Float32Array(input));
	};

	source.connect(processor);
	processor.connect(audioContext.destination);

	function concatFloat32(chunks: Float32Array[]) {
		let total = 0;
		for (const c of chunks) total += c.length;
		const out = new Float32Array(total);
		let offset = 0;
		for (const c of chunks) {
			out.set(c, offset);
			offset += c.length;
		}
		return out;
	}

	function resampleTo16k(
		input: Float32Array,
		fromRate: number,
		toRate: number,
	) {
		if (fromRate === toRate) return input;
		const ratio = fromRate / toRate;
		const newLength = Math.round(input.length / ratio);
		const output = new Float32Array(newLength);
		let index = 0;
		let pos = 0;
		for (let i = 0; i < newLength; i++) {
			const nextPos = i * ratio;
			const left = Math.floor(nextPos);
			const right = Math.min(left + 1, input.length - 1);
			const interp = nextPos - left;
			output[index++] = input[left] * (1 - interp) + input[right] * interp;
			pos = nextPos;
		}
		return output;
	}

	function floatTo16BitPCM(float32: Float32Array) {
		const buffer = new ArrayBuffer(float32.length * 2);
		const view = new DataView(buffer);
		let offset = 0;
		for (let i = 0; i < float32.length; i++, offset += 2) {
			let s = Math.max(-1, Math.min(1, float32[i]));
			view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
		}
		return buffer;
	}

	const recorder = {
		stream,
		start(intervalMs: number) {
			if (isRunning) return;
			isRunning = true;
			floatBuffer = [];
			if (flushTimer) {
				clearInterval(flushTimer);
				flushTimer = null;
			}
			flushTimer = window.setInterval(() => {
				if (!floatBuffer.length) return;
				const floats = concatFloat32(floatBuffer);
				floatBuffer = [];
				const resampled = resampleTo16k(
					floats,
					inputSampleRate,
					targetSampleRate,
				);
				const pcm = floatTo16BitPCM(resampled);
				onChunk(pcm);
			}, Math.max(50, intervalMs || 200));
		},
		stop() {
			isRunning = false;
			if (flushTimer) {
				clearInterval(flushTimer);
				flushTimer = null;
			}
			try {
				processor.disconnect();
			} catch {}
			try {
				source.disconnect();
			} catch {}
			try {
				audioContext.close();
			} catch {}
		},
	} as unknown as MediaRecorder;

	return recorder;
}
