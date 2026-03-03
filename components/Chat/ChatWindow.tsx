import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import MemberList from './MemberList'
import ChannelHeader from './ChannelHeader'
import { useSocket } from '@/hooks/useSocket'

export default function ChatWindow() {
  const { currentChannel, currentServer, messages } = useStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())
  const { socket } = useStore()

  useEffect(() => {
    if (!socket) return

    const handleTypingStart = ({ userId, channelId }: any) => {
      if (channelId === currentChannel?.id) {
        setTypingUsers(prev => new Set(prev).add(userId))
      }
    }

    const handleTypingStop = ({ userId, channelId }: any) => {
      if (channelId === currentChannel?.id) {
        setTypingUsers(prev => {
          const newSet = new Set(prev)
          newSet.delete(userId)
          return newSet
        })
      }
    }

    socket.on('typing:user-start', handleTypingStart)
    socket.on('typing:user-stop', handleTypingStop)

    return () => {
      socket.off('typing:user-start', handleTypingStart)
      socket.off('typing:user-stop', handleTypingStop)
    }
  }, [socket, currentChannel])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!currentChannel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-100">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-400 mb-2">
            Select a channel
          </h2>
          <p className="text-gray-500">
            Choose a channel from the sidebar to start chatting
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-dark-100">
      <ChannelHeader channel={currentChannel} />
      
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col">
          <MessageList messages={messages} />
          
          {typingUsers.size > 0 && (
            <div className="px-4 py-2 text-sm text-gray-400">
              {Array.from(typingUsers).length} user(s) typing...
            </div>
          )}
          
          <MessageInput channelId={currentChannel.id} />
          <div ref={messagesEndRef} />
        </div>
        
        {currentServer && <MemberList server={currentServer} />}
      </div>
    </div>
  )
}