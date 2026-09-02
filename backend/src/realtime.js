import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

export function attachRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      return next();
    } catch {
      return next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('project:join', (projectId) => {
      if (typeof projectId === 'string') socket.join(`project:${projectId}`);
    });

    socket.on('project:leave', (projectId) => {
      if (typeof projectId === 'string') socket.leave(`project:${projectId}`);
    });
  });

  return io;
}
