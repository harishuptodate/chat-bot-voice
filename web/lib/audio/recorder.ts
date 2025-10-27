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

	// Use AudioWorkletNode instead of deprecated ScriptProcessorNode
	await audioContext.audioWorklet.addModule(
		URL.createObjectURL(
			new Blob(
				[
					`
			class AudioProcessor extends AudioWorkletProcessor {
				constructor() {
					super();
					this._buffer = [];
				}

				process(inputs, outputs, parameters) {
					const input = inputs[0][0];
					if (input) {
						this._buffer.push(new Float32Array(input));
						if (this._buffer.length >= 4) { // ~4096 samples
							this.port.postMessage({
								audioData: this._buffer
							});
							this._buffer = [];
						}
					}
					return true;
				}
			}
			registerProcessor('audio-processor', AudioProcessor);
		`,
				],
				{ type: 'application/javascript' },
			),
		),
	);

	const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
	const inputSampleRate = audioContext.sampleRate; // typically 48000
	const targetSampleRate = 16000;
	const inputNeededPerPacket = Math.round(
		targetSampleRate * 0.2 * (inputSampleRate / targetSampleRate),
	); // ~9600 samples for 200ms
	let isRunning = false;
	let floatChunks: Float32Array[] = [];
	let totalFloatLen = 0;

	workletNode.port.onmessage = (event) => {
		if (!isRunning) return;
		const chunks: Float32Array[] = event.data.audioData || [];
		for (const c of chunks) {
			floatChunks.push(c);
			totalFloatLen += c.length;
		}
		processBuffer();
	};

	source.connect(workletNode);
	workletNode.connect(audioContext.destination);

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
		for (let i = 0; i < newLength; i++) {
			const nextPos = i * ratio;
			const left = Math.floor(nextPos);
			const right = Math.min(left + 1, input.length - 1);
			const interp = nextPos - left;
			output[i] = input[left] * (1 - interp) + input[right] * interp;
		}
		return output;
	}

	function floatTo16BitPCM(float32: Float32Array) {
		const buffer = new ArrayBuffer(float32.length * 2);
		const view = new DataView(buffer);
		for (let i = 0; i < float32.length; i++) {
			let s = Math.max(-1, Math.min(1, float32[i]));
			view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
		}
		return buffer;
	}

	function processBuffer() {
		// Only flush when we have enough input to produce ~200ms at 16k (i.e., 3200 samples)
		while (totalFloatLen >= inputNeededPerPacket) {
			// Concatenate available chunks
			const floatsAll = concatFloat32(floatChunks);
			// Slice the first inputNeededPerPacket samples
			const slice = floatsAll.subarray(0, inputNeededPerPacket);
			const remain = floatsAll.subarray(inputNeededPerPacket);
			// Rebuild floatChunks from the remaining tail to avoid unbounded growth
			floatChunks = remain.length ? [remain] : [];
			totalFloatLen = remain.length;

			const resampled = resampleTo16k(slice, inputSampleRate, targetSampleRate);
			const pcm = floatTo16BitPCM(resampled);
			onChunk(pcm);
		}
	}

	const recorder = {
		stream,
		start() {
			if (isRunning) return;
			isRunning = true;
			floatChunks = [];
			totalFloatLen = 0;
		},
		async stop() {
			isRunning = false;
			try {
				workletNode.disconnect();
				source.disconnect();
				await audioContext.close();
			} catch (err) {
				console.error('Error cleaning up audio context:', err);
			}
		},
	} as unknown as MediaRecorder;

	return recorder;
}
