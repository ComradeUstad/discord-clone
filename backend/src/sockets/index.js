import { Server } from 'socket.io';
import prisma from '../utils/prisma.js';

const userSockets = new Map(); // userId -> socketId

export const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    const userId = socket.userId;
    userSockets.set(userId, socket.id);

    // Update user status to online
    updateUserStatus(userId, 'ONLINE', io);

    // Join server rooms
    socket.on('join-server', (serverId) => {
      socket.join(`server:${serverId}`);
    });

    // Join channel
    socket.on('join-channel', (channelId) => {
      socket.join(`channel:${channelId}`);
    });

    // Leave channel
    socket.on('leave-channel', (channelId) => {
      socket.leave(`channel:${channelId}`);
    });

    // Send message
    socket.on('message:send', async (data) => {
      try {
        const { channelId, content, attachmentUrl } = data;

        const message = await prisma.message.create({
          data: {
            channelId,
            senderId: userId,
            content,
            attachmentUrl
          },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                avatarUrl: true
              }
            }
          }
        });

        io.to(`channel:${channelId}`).emit('message:receive', message);
      } catch (error) {
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Edit message
    socket.on('message:edit', async (data) => {
      try {
        const { messageId, content } = data;

        const message = await prisma.message.findUnique({
          where: { id: messageId }
        });

        if (message.senderId !== userId) {
          return socket.emit('error', { message: 'Unauthorized' });
        }

        const updatedMessage = await prisma.message.update({
          where: { id: messageId },
          data: { content },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                avatarUrl: true
              }
            }
          }
        });

        io.to(`channel:${message.channelId}`).emit('message:update', updatedMessage);
      } catch (error) {
        socket.emit('error', { message: 'Failed to edit message' });
      }
    });

    // Delete message
    socket.on('message:delete', async (data) => {
      try {
        const { messageId } = data;

        const message = await prisma.message.findUnique({
          where: { id: messageId }
        });

        if (message.senderId !== userId) {
          return socket.emit('error', { message: 'Unauthorized' });
        }

        await prisma.message.delete({
          where: { id: messageId }
        });

        io.to(`channel:${message.channelId}`).emit('message:remove', { messageId });
      } catch (error) {
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Typing indicator
    socket.on('typing:start', (data) => {
      const { channelId } = data;
      socket.to(`channel:${channelId}`).emit('typing:user-start', {
        userId,
        channelId
      });
    });

    socket.on('typing:stop', (data) => {
      const { channelId } = data;
      socket.to(`channel:${channelId}`).emit('typing:user-stop', {
        userId,
        channelId
      });
    });

    // Add reaction
    socket.on('reaction:add', async (data) => {
      try {
        const { messageId, emoji } = data;

        const reaction = await prisma.reaction.create({
          data: {
            messageId,
            userId,
            emoji
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true
              }
            }
          }
        });

        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: { channelId: true }
        });

        io.to(`channel:${message.channelId}`).emit('reaction:new', reaction);
      } catch (error) {
        socket.emit('error', { message: 'Failed to add reaction' });
      }
    });

    // Remove reaction
    socket.on('reaction:remove', async (data) => {
      try {
        const { messageId, emoji } = data;

        await prisma.reaction.delete({
          where: {
            messageId_userId_emoji: {
              messageId,
              userId,
              emoji
            }
          }
        });

        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: { channelId: true }
        });

        io.to(`channel:${message.channelId}`).emit('reaction:remove', {
          messageId,
          userId,
          emoji
        });
      } catch (error) {
        socket.emit('error', { message: 'Failed to remove reaction' });
      }
    });

    // Voice signaling
    socket.on('voice:join', (data) => {
      const { channelId } = data;
      socket.join(`voice:${channelId}`);
      socket.to(`voice:${channelId}`).emit('voice:user-joined', { userId });
    });

    socket.on('voice:offer', (data) => {
      const { targetUserId, offer, channelId } = data;
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('voice:offer', {
          userId,
          offer,
          channelId
        });
      }
    });

    socket.on('voice:answer', (data) => {
      const { targetUserId, answer, channelId } = data;
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('voice:answer', {
          userId,
          answer,
          channelId
        });
      }
    });

    socket.on('voice:ice-candidate', (data) => {
      const { targetUserId, candidate, channelId } = data;
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('voice:ice-candidate', {
          userId,
          candidate,
          channelId
        });
      }
    });

    socket.on('voice:leave', (data) => {
      const { channelId } = data;
      socket.leave(`voice:${channelId}`);
      socket.to(`voice:${channelId}`).emit('voice:user-left', { userId });
    });

    // Disconnect
    socket.on('disconnect', () => {
      userSockets.delete(userId);
      updateUserStatus(userId, 'OFFLINE', io);
    });
  });
};

async function updateUserStatus(userId, status, io) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { status }
    });

    io.emit('presence:update', { userId, status });
  } catch (error) {
    console.error('Failed to update user status:', error);
  }
}