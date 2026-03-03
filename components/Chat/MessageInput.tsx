import React, { useState, useRef, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { IoSend, IoAttach } from 'react-icons/io5'
import { BsEmojiSmile } from 'react-icons/bs'
import EmojiPicker from 'emoji-picker-react'
import TextareaAutosize from 'react-textarea-autosize'
import axios from 'axios'
import toast from 'react-hot-toast'

interface MessageInputProps {
  channelId: string
}

export default function MessageInput({ channelId }: MessageInputProps) {
  const [message, setMessage] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [uploading, setUploading] = useState(false)
  const { socket } = useStore()
  const typingTimeoutRef = useRef<NodeJS.Timeout>()

  const handleTyping = () => {
    if (!socket) return

    socket.emit('typing:start', { channelId })

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { channelId })
    }, 1000)
  }

  const handleSendMessage = async () => {
    if (!message.trim() || !socket) return

    socket.emit('message:send', {
      channelId,
      content: message.trim()
    })

    setMessage('')
    
    // Stop typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      socket.emit('typing:stop', { channelId })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      setUploading(true)
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/upload`,
        formData
      )

      if (socket) {
        socket.emit('message:send', {
          channelId,
          content: '',
          attachmentUrl: response.data.url
        })
      }
    } catch (error) {
      toast.error('Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-4 bg-dark-100 border-t border-gray-800">
      {showEmojiPicker && (
        <div className="absolute bottom-20 mb-2">
          <EmojiPicker
            onEmojiClick={(emojiData) => {
              setMessage(prev => prev + emojiData.emoji)
              setShowEmojiPicker(false)
            }}
          />
        </div>
      )}
      
      <div className="flex items-end gap-2 bg-dark-200 rounded-lg p-2">
        <button
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="p-2 text-gray-400 hover:text-white transition"
        >
          <BsEmojiSmile size={20} />
        </button>
        
        <label className="p-2 text-gray-400 hover:text-white transition cursor-pointer">
          <IoAttach size={20} />
          <input
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            disabled={uploading}
          />
        </label>
        
        <TextareaAutosize
          value={message}
          onChange={(e) => {
            setMessage(e.target.value)
            handleTyping()
          }}
          onKeyDown={handleKeyDown}
          placeholder={`Message #${channelId}`}
          className="flex-1 bg-transparent outline-none resize-none max-h-96 p-2"
          maxRows={10}
        />
        
        <button
          onClick={handleSendMessage}
          disabled={!message.trim()}
          className="p-2 text-white bg-discord-600 rounded-lg hover:bg-discord-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <IoSend size={20} />
        </button>
      </div>
    </div>
  )
}