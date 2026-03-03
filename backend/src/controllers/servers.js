import prisma from '../utils/prisma.js';

export const createServer = async (req, res) => {
  try {
    const { name, icon } = req.body;
    const ownerId = req.userId;

    const server = await prisma.server.create({
      data: {
        name,
        icon,
        ownerId,
        members: {
          create: {
            userId: ownerId,
            role: {
              create: {
                name: 'Admin',
                permissions: ['ALL'],
                color: '#ff5555',
                position: 100
              }
            }
          }
        },
        channels: {
          create: [
            { name: 'general', type: 'TEXT', position: 0 },
            { name: 'voice', type: 'VOICE', position: 1 }
          ]
        }
      },
      include: {
        members: {
          include: {
            user: true,
            role: true
          }
        },
        channels: true
      }
    });

    res.status(201).json({ server });
  } catch (error) {
    console.error('Create server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getServers = async (req, res) => {
  try {
    const servers = await prisma.server.findMany({
      where: {
        members: {
          some: {
            userId: req.userId
          }
        }
      },
      include: {
        channels: {
          orderBy: {
            position: 'asc'
          }
        },
        members: {
          include: {
            user: true,
            role: true
          }
        }
      }
    });

    res.json({ servers });
  } catch (error) {
    console.error('Get servers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getServerById = async (req, res) => {
  try {
    const { id } = req.params;

    const server = await prisma.server.findUnique({
      where: { id },
      include: {
        channels: {
          orderBy: {
            position: 'asc'
          }
        },
        members: {
          include: {
            user: true,
            role: true
          }
        },
        roles: {
          orderBy: {
            position: 'desc'
          }
        }
      }
    });

    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check if user is member
    const isMember = server.members.some(m => m.userId === req.userId);
    if (!isMember) {
      return res.status(403).json({ message: 'Not a member of this server' });
    }

    res.json({ server });
  } catch (error) {
    console.error('Get server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const joinServer = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Check if server exists
    const server = await prisma.server.findUnique({
      where: { id },
      include: {
        members: true
      }
    });

    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check if already member
    const isMember = server.members.some(m => m.userId === userId);
    if (isMember) {
      return res.status(400).json({ message: 'Already a member' });
    }

    // Get default role
    const defaultRole = await prisma.role.findFirst({
      where: {
        serverId: id,
        name: 'Member'
      }
    });

    // Add member
    const member = await prisma.serverMember.create({
      data: {
        userId,
        serverId: id,
        roleId: defaultRole?.id
      },
      include: {
        user: true,
        role: true
      }
    });

    res.status(201).json({ member });
  } catch (error) {
    console.error('Join server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteServer = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user is owner
    const server = await prisma.server.findUnique({
      where: { id }
    });

    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    if (server.ownerId !== req.userId) {
      return res.status(403).json({ message: 'Only owner can delete server' });
    }

    // Delete server (cascades to channels, messages, members, roles)
    await prisma.server.delete({
      where: { id }
    });

    res.json({ message: 'Server deleted successfully' });
  } catch (error) {
    console.error('Delete server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};