import { io, type Socket } from 'socket.io-client';
import { getToken } from './api';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  socket?.disconnect();
  // o token é lido a cada reconexão: trocar a senha gera um token novo e o antigo para de valer
  socket = io({ path: '/socket.io', auth: (cb) => cb({ token: getToken() ?? token }), transports: ['websocket'] });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
