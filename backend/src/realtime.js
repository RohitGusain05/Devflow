import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { query } from './db.js';

function getSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not configured');
  return secret;
}

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
      socket.user = jwt.verify(token, getSecret());
      return next();
    } catch {
      return next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('project:join', async (projectId, callback) => {
      try {
        if (typeof projectId !== 'string') throw new Error('Invalid project id');
        const result = await query(
          `SELECT 1
           FROM projects p
           JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
           WHERE p.id = $1 AND wm.user_id = $2`,
          [projectId, socket.user.sub],
        );
        if (!result.rows[0]) throw new Error('Project access denied');
        socket.join(`project:${projectId}`);
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, error: error.message });
      }
    });

    socket.on('project:leave', (projectId) => {
      if (typeof projectId === 'string') socket.leave(`project:${projectId}`);
    });
  });

  return io;
}

export function emitProjectEvent(io, projectId, event, payload) {
  io.to(`project:${projectId}`).emit(event, payload);
}
