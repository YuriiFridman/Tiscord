import { useRef, useCallback, useEffect, useState } from 'react';
import { useWebSocketStore } from '../store/ws';
import { voiceApi } from '../lib/api';
import type { VoiceParticipant, User } from '../types';

const STUN_URLS = (import.meta.env.VITE_STUN_URLS ?? 'stun:stun.l.google.com:19302')
  .split(',')
  .map((u: string) => u.trim());

const ICE_SERVERS: RTCIceServer[] = [{ urls: STUN_URLS }];

interface PeerEntry {
  userId: string;
  pc: RTCPeerConnection;
  stream?: MediaStream;
}

interface VoiceHookState {
  inCall: boolean;
  channelId: string | null;
  participants: VoiceParticipant[];
  localStream: MediaStream | null;
  isMuted: boolean;
  isDeafened: boolean;
  joinChannel: (channelId: string, currentUser: User) => Promise<void>;
  leaveChannel: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
}

export function useVoice(): VoiceHookState {
  const { send, on, off } = useWebSocketStore.getState();
  const [inCall, setInCall] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const currentUserRef = useRef<User | null>(null);

  const createPeer = useCallback(
    (remoteUserId: string, initiator: boolean): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      localStreamRef.current?.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          send('CALL_SIGNAL', {
            target_user_id: remoteUserId,
            type: 'ice-candidate',
            candidate: ev.candidate,
          });
        }
      };

      pc.ontrack = (ev) => {
        const entry = peersRef.current.get(remoteUserId);
        if (entry) {
          entry.stream = ev.streams[0];
          peersRef.current.set(remoteUserId, entry);
        }
      };

      if (initiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            send('CALL_SIGNAL', {
              target_user_id: remoteUserId,
              type: 'offer',
              sdp: pc.localDescription,
            });
          })
          .catch(console.error);
      }

      return pc;
    },
    [send],
  );

  const handleCallSignal = useCallback(
    async (raw: unknown) => {
      const data = raw as {
        from_user_id: string;
        type: string;
        sdp?: RTCSessionDescriptionInit;
        candidate?: RTCIceCandidateInit;
      };

      const { from_user_id, type } = data;

      if (type === 'offer') {
        let peer = peersRef.current.get(from_user_id);
        if (!peer) {
          const pc = createPeer(from_user_id, false);
          peer = { userId: from_user_id, pc };
          peersRef.current.set(from_user_id, peer);
        }
        await peer.pc.setRemoteDescription(data.sdp!);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        send('CALL_SIGNAL', { target_user_id: from_user_id, type: 'answer', sdp: peer.pc.localDescription });
      } else if (type === 'answer') {
        const peer = peersRef.current.get(from_user_id);
        if (peer) await peer.pc.setRemoteDescription(data.sdp!);
      } else if (type === 'ice-candidate') {
        const peer = peersRef.current.get(from_user_id);
        if (peer && data.candidate) {
          await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      }
    },
    [createPeer, send],
  );

  const handleVoiceStateUpdate = useCallback((raw: unknown) => {
    const data = raw as { channel_id: string; user: VoiceParticipant['user']; action: 'join' | 'leave'; is_muted: boolean; is_deafened: boolean };
    setParticipants((prev) => {
      if (data.action === 'join') {
        const exists = prev.find((p) => p.user.id === data.user.id);
        if (exists) return prev;
        return [...prev, { user: data.user, is_muted: data.is_muted, is_deafened: data.is_deafened }];
      } else {
        return prev.filter((p) => p.user.id !== data.user.id);
      }
    });
  }, []);

  useEffect(() => {
    on('CALL_SIGNAL', handleCallSignal);
    on('VOICE_STATE_UPDATE', handleVoiceStateUpdate);
    return () => {
      off('CALL_SIGNAL', handleCallSignal);
      off('VOICE_STATE_UPDATE', handleVoiceStateUpdate);
    };
  }, [on, off, handleCallSignal, handleVoiceStateUpdate]);

  const joinChannel = useCallback(
    async (chId: string, user: User) => {
      currentUserRef.current = user;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setChannelId(chId);
      setInCall(true);
      setParticipants([{ user, is_muted: false, is_deafened: false }]);

      // Register session on the backend and broadcast VOICE_STATE_UPDATE to guild members
      await voiceApi.join(chId).catch(console.error);

      send('CALL_SIGNAL', { channel_id: chId, type: 'join' });
    },
    [send],
  );

  const leaveChannel = useCallback(() => {
    const chId = channelId;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    peersRef.current.forEach(({ pc }) => pc.close());
    peersRef.current.clear();
    setInCall(false);
    setChannelId(null);
    setParticipants([]);
    setLocalStream(null);
    if (chId) {
      voiceApi.leave(chId).catch(console.error);
      send('CALL_SIGNAL', { channel_id: chId, type: 'leave' });
    }
  }, [channelId, send]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const newMuted = !isMuted;
    stream.getAudioTracks().forEach((t) => { t.enabled = !newMuted; });
    setIsMuted(newMuted);
  }, [isMuted]);

  const toggleDeafen = useCallback(() => {
    setIsDeafened((d) => !d);
  }, []);

  return { inCall, channelId, participants, localStream, isMuted, isDeafened, joinChannel, leaveChannel, toggleMute, toggleDeafen };
}
