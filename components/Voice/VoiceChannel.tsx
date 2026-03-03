import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { FaMicrophone, FaMicrophoneSlash, FaVolumeUp, FaVolumeMute } from 'react-icons/fa'
import { MdScreenShare, MdStopScreenShare } from 'react-icons/md'

interface VoiceChannelProps {
  channelId: string
}

export default function VoiceChannel({ channelId }: VoiceChannelProps) {
  const [isInVoice, setIsInVoice] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [participants, setParticipants] = useState<Set<string>>(new Set())
  
  const { socket, user } = useStore()
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())
  const localStream = useRef<MediaStream | null>(null)
  const screenStream = useRef<MediaStream | null>(null)
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map())

  useEffect(() => {
    if (!socket || !isInVoice) return

    socket.emit('voice:join', { channelId })

    const handleUserJoined = async ({ userId }: { userId: string }) => {
      if (userId === user?.id) return
      
      setParticipants(prev => new Set(prev).add(userId))
      
      // Create peer connection for new user
      const pc = createPeerConnection(userId)
      peerConnections.current.set(userId, pc)

      // Create and send offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      socket.emit('voice:offer', {
        targetUserId: userId,
        offer,
        channelId
      })
    }

    const handleOffer = async ({ userId, offer }: any) => {
      const pc = createPeerConnection(userId)
      peerConnections.current.set(userId, pc)
      
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      
      socket.emit('voice:answer', {
        targetUserId: userId,
        answer,
        channelId
      })
    }

    const handleAnswer = async ({ userId, answer }: any) => {
      const pc = peerConnections.current.get(userId)
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
      }
    }

    const handleIceCandidate = async ({ userId, candidate }: any) => {
      const pc = peerConnections.current.get(userId)
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
    }

    const handleUserLeft = ({ userId }: { userId: string }) => {
      const pc = peerConnections.current.get(userId)
      if (pc) {
        pc.close()
        peerConnections.current.delete(userId)
      }
      
      const audio = audioRefs.current.get(userId)
      if (audio) {
        audio.remove()
        audioRefs.current.delete(userId)
      }
      
      setParticipants(prev => {
        const newSet = new Set(prev)
        newSet.delete(userId)
        return newSet
      })
    }

    socket.on('voice:user-joined', handleUserJoined)
    socket.on('voice:offer', handleOffer)
    socket.on('voice:answer', handleAnswer)
    socket.on('voice:ice-candidate', handleIceCandidate)
    socket.on('voice:user-left', handleUserLeft)

    return () => {
      socket.off('voice:user-joined', handleUserJoined)
      socket.off('voice:offer', handleOffer)
      socket.off('voice:answer', handleAnswer)
      socket.off('voice:ice-candidate', handleIceCandidate)
      socket.off('voice:user-left', handleUserLeft)
      
      // Clean up
      peerConnections.current.forEach(pc => pc.close())
      peerConnections.current.clear()
      
      localStream.current?.getTracks().forEach(track => track.stop())
      screenStream.current?.getTracks().forEach(track => track.stop())
      
      audioRefs.current.forEach(audio => audio.remove())
      audioRefs.current.clear()
      
      socket.emit('voice:leave', { channelId })
    }
  }, [socket, isInVoice, channelId, user])

  const createPeerConnection = (userId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    })

    // Add local tracks
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current!)
      })
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      const [stream] = event.streams
      
      let audio = audioRefs.current.get(userId)
      if (!audio) {
        audio = new Audio()
        audio.autoplay = true
        audioRefs.current.set(userId, audio)
      }
      
      audio.srcObject = stream
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('voice:ice-candidate', {
          targetUserId: userId,
          candidate: event.candidate,
          channelId
        })
      }
    }

    return pc
  }

  const joinVoice = async () => {
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      })
      
      setIsInVoice(true)
    } catch (error) {
      console.error('Failed to get audio stream:', error)
    }
  }

  const leaveVoice = () => {
    setIsInVoice(false)
  }

  const toggleMute = () => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted
      })
    }
    setIsMuted(!isMuted)
  }

  const toggleDeafen = () => {
    audioRefs.current.forEach(audio => {
      audio.muted = !isDeafened
    })
    setIsDeafened(!isDeafened)
  }

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        screenStream.current = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        })
        
        // Replace video track in all peer connections
        const videoTrack = screenStream.current.getVideoTracks()[0]
        peerConnections.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video')
          if (sender) {
            sender.replaceTrack(videoTrack)
          }
        })
        
        videoTrack.onended = () => {
          stopScreenShare()
        }
        
        setIsScreenSharing(true)
      } catch (error) {
        console.error('Failed to share screen:', error)
      }
    } else {
      stopScreenShare()
    }
  }

  const stopScreenShare = () => {
    if (screenStream.current) {
      screenStream.current.getTracks().forEach(track => track.stop())
      screenStream.current = null
    }
    
    // Restore camera track if available
    // For now, just disable video
    peerConnections.current.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video')
      if (sender && sender.track) {
        sender.track.enabled = false
      }
    })
    
    setIsScreenSharing(false)
  }

  if (!isInVoice) {
    return (
      <button
        onClick={joinVoice}
        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
      >
        Join Voice
      </button>
    )
  }

  return (
    <div className="bg-dark-200 p-4 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-400">
          {participants.size} participant(s) in voice
        </span>
        
        <div className="flex gap-2">
          <button
            onClick={toggleMute}
            className={`p-2 rounded-lg transition ${
              isMuted 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
          </button>
          
          <button
            onClick={toggleDeafen}
            className={`p-2 rounded-lg transition ${
              isDeafened 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {isDeafened ? <FaVolumeMute /> : <FaVolumeUp />}
          </button>
          
          <button
            onClick={toggleScreenShare}
            className={`p-2 rounded-lg transition ${
              isScreenSharing 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {isScreenSharing ? <MdStopScreenShare /> : <MdScreenShare />}
          </button>
          
          <button
            onClick={leaveVoice}
            className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  )
}