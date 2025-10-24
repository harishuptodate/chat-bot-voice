export async function createRecorder(onChunk: (buf: ArrayBuffer) => void) {
	const stream = await navigator.mediaDevices.getUserMedia({
		audio: {
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true,
		},
	});
	const rec = new MediaRecorder(stream, {
		mimeType: 'audio/webm;codecs=opus',
		audioBitsPerSecond: 32000,
	});
	rec.ondataavailable = async (e) => {
		if (!e.data || e.data.size === 0) return;
		const buf = await e.data.arrayBuffer();
		onChunk(buf);
	};
	return rec;
}
