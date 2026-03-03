import { create } from 'zustand'
import { io, Socket } from 'socket.io-client'
import axios from 'axios'

interface User {
  id: string
  username: string
  email: string
  avatarUrl: string
  status: 'ONLINE' | 'OFFLINE' | 'IDLE' | 'DND'
}

interface Message {
  id: string
  content: string
  senderId: string
  channelId: string
  attachmentUrl?: string
  createdAt: string
  sender: User
  reactions: Reaction[]
}

interface Reaction {
  id: string
  emoji: string
  userId: string
  user: User
}

interface Channel {
  id: string
  name: string
  type: 'TEXT' | 'VOICE'
  serverId: string
}

interface Server {
  id: string
  name: string
  icon: string
  channels: Channel[]
  members: ServerMember[]
}

interface ServerMember {
  user: User
  role?: Role
}

interface Role {
  id: string
  name: string
  permissions: string[]
  color: string
}

interface Store {
  user: User | null
  servers: Server[]
  currentServer: Server | null
  currentChannel: Channel | null
  messages: Message[]
  socket: Socket | null
  isAuthenticated: boolean
  onlineUsers: Set<string>
  
  setUser: (user: User | null) => void
  setServers: (servers: Server[]) => void
  setCurrentServer: (server: Server | null) => void
  setCurrentChannel: (channel: Channel | null) => void
  addMessage: (message: Message) => void
  updateMessage: (message: Message) => void
  removeMessage: (messageId: string) => void
  addReaction: (reaction: Reaction) => void
  removeReaction: (messageId: string, userId: string, emoji: string) => void
  setOnlineUsers: (users: Set<string>) => void
  login: (token: string, user: User) => void
  logout: () => void
  initializeSocket: () => void
  disconnectSocket: () => void
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

export const useStore = create<Store>((set, get) => ({
  user: null,
  servers: [],
  currentServer: null,
  currentChannel: null,
  messages: [],
  socket: null,
  isAuthenticated: false,
  onlineUsers: new Set(),

  setUser: (user) => set({ user }),
  
  setServers: (servers) => set({ servers }),
  
  setCurrentServer: (server) => {
    set({ currentServer: server, currentChannel: null, messages: [] })
  },
  
  setCurrentChannel: (channel) => {
    set({ currentChannel: channel, messages: [] })
    // Load messages for channel
    if (channel) {
      get().loadMessages(channel.id)
    }
  },
  
  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message]
    }))
  },
  
  updateMessage: (message) => {
    set((state) => ({
      messages: state.messages.map(m => 
        m.id === message.id ? message : m
      )
    }))
  },
  
  removeMessage: (messageId) => {
    set((state) => ({
      messages: state.messages.filter(m => m.id !== messageId)
    }))
  },
  
  addReaction: (reaction) => {
    set((state) => ({
      messages: state.messages.map(m => {
        if (m.id === reaction.messageId) {
          return {
            ...m,
            reactions: [...m.reactions, reaction]
          }
        }
        return m
      })
    }))
  },
  
  removeReaction: (messageId, userId, emoji) => {
    set((state) => ({
      messages: state.messages.map(m => {
        if (m.id === messageId) {
          return {
            ...m,
            reactions: m.reactions.filter(
              r => !(r.userId === userId && r.emoji === emoji)
            )
          }
        }
        return m
      })
    }))
  },
  
  setOnlineUsers: (users) => set({ onlineUsers: users }),
  
  login: (token, user) => {
    localStorage.setItem('token', token)
    set({ user, isAuthenticated: true })
    get().initializeSocket()
  },
  
  logout: () => {
    localStorage.removeItem('token')
    get().disconnectSocket()
    set({ user: null, isAuthenticated: false, servers: [], onlineUsers: new Set() })
  },
  
  initializeSocket: () => {
    const token = localStorage.getItem('token')
    if (!token) return

    const socket = io(API_URL, {
      auth: { token }
    })

    socket.on('connect', () => {
      console.log('Connected to socket')
    })

    socket.on('message:receive', (message) => {
      if (message.channelId === get().currentChannel?.id) {
        get().addMessage(message)
      }
    })

    socket.on('message:update', (message) => {
      if (message.channelId === get().currentChannel?.id) {
        get().updateMessage(message)
      }
    })

    socket.on('message:remove', ({ messageId }) => {
      get().removeMessage(messageId)
    })

    socket.on('reaction:new', (reaction) => {
      get().addReaction(reaction)
    })

    socket.on('reaction:remove', ({ messageId, userId, emoji }) => {
      get().removeReaction(messageId, userId, emoji)
    })

    socket.on('presence:update', ({ userId, status }) => {
      set((state) => {
        const newOnlineUsers = new Set(state.onlineUsers)
        if (status === 'ONLINE') {
          newOnlineUsers.add(userId)
        } else {
          newOnlineUsers.delete(userId)
        }
        return { onlineUsers: newOnlineUsers }
      })
    })

    socket.on('typing:user-start', ({ userId, channelId }) => {
      // Handle typing indicator
    })

    socket.on('typing:user-stop', ({ userId, channelId }) => {
      // Handle typing indicator
    })

    set({ socket })
  },
  
  disconnectSocket: () => {
    const { socket } = get()
    if (socket) {
      socket.disconnect()
      set({ socket: null })
    }
  },
  
  loadMessages: async (channelId: string) => {
    try {
      const response = await axios.get(`${API_URL}/api/messages/${channelId}`)
      set({ messages: response.data.messages })
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }
}))