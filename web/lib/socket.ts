import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket() {
	if (!socket) {
		const url = process.env.NEXT_PUBLIC_REALTIME_WS_URL || 'http://localhost:8080';
		console.log('url', url);
		socket = io(url, {
			transports: ['websocket', 'polling'],
			withCredentials: true,
			path: '/socket.io',
			reconnection: true,
			reconnectionAttempts: 5,
			reconnectionDelay: 1000,
		});
	}
	return socket;
}
