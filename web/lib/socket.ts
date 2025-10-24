import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket() {
	if (!socket) {
		const url = process.env.NEXT_PUBLIC_REALTIME_WS_URL || 'http://localhost:8080';
		socket = io(url, {
			autoConnect: false,
		});
		
		// Add debugging event listeners
		socket.on('connect_error', (error: any) => {
			console.error('❌ Socket connection error:', error);
		});
		
		socket.on('disconnect', (reason: string) => {
			console.warn('⚠️ Socket disconnected:', reason);
		});
		
		socket.on('error', (error: any) => {
			console.error('❌ Socket error:', error);
		});
	}
	return socket;
}
