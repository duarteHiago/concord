import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  socket?.disconnect();
  socket = io({ path: '/socket.io', auth: { token }, transports: ['websocket'] });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
