import prisma from '../utils/prisma.js';

export const getMessages = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { cursor, limit = 50 } = req.query;

    const messages = await prisma.message.findMany({
      where: { channelId },
      take: parseInt(limit),
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatarUrl: true
          }
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true
              }
            }
          }
        }
      }
    });

    res.json({
      messages: messages.reverse(),
      nextCursor: messages.length === parseInt(limit) ? messages[0]?.id : null
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};