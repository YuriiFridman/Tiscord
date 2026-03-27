import { useRef, useCallback, useEffect, useState } from 'react';
import { useWebSocketStore } from '../store/ws';
import { voiceApi } from '../lib/api';
import type { VoiceParticipant, User } from '../types';

const STUN_URLS = (import.meta.env.VITE_STUN_URLS ?? 'stun:stun.l.google.com:19302')
  .split(',')
  .map((u: string) => u.trim());

const ICE_SERVERS: RTCIceServer[] = [{ urls: STUN_URLS }];
const MUTE_ON_FREQ = 420;
const MUTE_OFF_FREQ = 740;
const DEAFEN_ON_FREQ = 310;
const DEAFEN_OFF_FREQ = 620;
const MIN_GAIN = 0.001;
const PEAK_GAIN = 0.08;
const ATTACK_TIME = 0.01;
const RELEASE_TIME = 0.12;
const TONE_DURATION = 0.13;

function playToggleSound(kind: 'mute' | 'deafen', enabled: boolean) {
  const Ctx = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;

  const audioContext = new Ctx();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = kind === 'mute'
    ? (enabled ? MUTE_ON_FREQ : MUTE_OFF_FREQ)
    : (enabled ? DEAFEN_ON_FREQ : DEAFEN_OFF_FREQ);

  gain.gain.value = MIN_GAIN;
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, audioContext.currentTime + ATTACK_TIME);
  gain.gain.exponentialRampToValueAtTime(MIN_GAIN, audioContext.currentTime + RELEASE_TIME);
  oscillator.stop(audioContext.currentTime + TONE_DURATION);
  oscillator.onended = () => {
    audioContext.close().catch(() => undefined);
  };
}

interface PeerEntry {
  userId: string;
  pc: RTCPeerConnection;
  stream?: MediaStream;
  audioEl?: HTMLAudioElement;
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
  const mutedRef = useRef(false);
  const deafenedRef = useRef(false);
  const preDeafenMuteRef = useRef(false);

  mutedRef.current = isMuted;
  deafenedRef.current = isDeafened;

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
          if (!entry.audioEl) {
            entry.audioEl = new Audio();
            entry.audioEl.autoplay = true;
          }
          entry.audioEl.srcObject = ev.streams[0];
          entry.audioEl.muted = deafenedRef.current;
          const preferredOutputId = localStorage.getItem('voice_output_device_id');
          if (preferredOutputId && 'setSinkId' in entry.audioEl) {
            entry.audioEl.setSinkId(preferredOutputId).catch(() => undefined);
          }
          entry.audioEl.play().catch(() => undefined);
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
    const data = raw as {
      channel_id: string;
      user: VoiceParticipant['user'];
      action: 'join' | 'leave' | 'state';
      is_muted: boolean;
      is_deafened: boolean;
    };
    if (!inCall || data.channel_id !== channelId) return;

    const localUserId = currentUserRef.current?.id;
    if (data.action === 'join' && data.user.id !== localUserId && !peersRef.current.has(data.user.id)) {
      const pc = createPeer(data.user.id, true);
      peersRef.current.set(data.user.id, { userId: data.user.id, pc });
    }
    if (data.action === 'leave') {
      const peer = peersRef.current.get(data.user.id);
      if (peer) {
        peer.pc.close();
        if (peer.audioEl) {
          peer.audioEl.pause();
          peer.audioEl.srcObject = null;
        }
        peersRef.current.delete(data.user.id);
      }
    }

    setParticipants((prev) => {
      if (data.action === 'join') {
        const exists = prev.find((p) => p.user.id === data.user.id);
        if (exists) {
          return prev.map((p) => (
            p.user.id === data.user.id
              ? { ...p, is_muted: data.is_muted, is_deafened: data.is_deafened }
              : p
          ));
        }
        return [...prev, { user: data.user, is_muted: data.is_muted, is_deafened: data.is_deafened }];
      }
      if (data.action === 'state') {
        return prev.map((p) => (
          p.user.id === data.user.id
            ? { ...p, is_muted: data.is_muted, is_deafened: data.is_deafened }
            : p
        ));
      }
      return prev.filter((p) => p.user.id !== data.user.id);
    });
  }, [channelId, createPeer, inCall]);

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
      const preferredInputId = localStorage.getItem('voice_input_device_id');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: preferredInputId ? { deviceId: { exact: preferredInputId } } : true,
        video: false,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setChannelId(chId);
      setInCall(true);
      setParticipants([{ user, is_muted: false, is_deafened: false }]);

      // Register session on the backend and broadcast VOICE_STATE_UPDATE to guild members
      await voiceApi.join(chId).catch(console.error);
      const existingParticipants = await voiceApi.getParticipants(chId).catch((err) => {
        console.error(err);
        return [];
      });
      existingParticipants
        .filter((p: VoiceParticipant) => p.user.id !== user.id)
        .forEach((p: VoiceParticipant) => {
          if (peersRef.current.has(p.user.id)) return;
          const pc = createPeer(p.user.id, true);
          peersRef.current.set(p.user.id, { userId: p.user.id, pc });
        });

      send('CALL_SIGNAL', { channel_id: chId, type: 'join' });
    },
    [createPeer, send],
  );

  const leaveChannel = useCallback(() => {
    const chId = channelId;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    peersRef.current.forEach(({ pc, audioEl }) => {
      pc.close();
      if (audioEl) {
        audioEl.pause();
        audioEl.srcObject = null;
      }
    });
    peersRef.current.clear();
    setInCall(false);
    setChannelId(null);
    setParticipants([]);
    setLocalStream(null);
    setIsMuted(false);
    setIsDeafened(false);
    mutedRef.current = false;
    deafenedRef.current = false;
    preDeafenMuteRef.current = false;
    if (chId) {
      voiceApi.leave(chId).catch(console.error);
      send('CALL_SIGNAL', { channel_id: chId, type: 'leave' });
    }
  }, [channelId, send]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const newMuted = !mutedRef.current;
    stream.getAudioTracks().forEach((t) => { t.enabled = !newMuted; });
    setIsMuted(newMuted);
    mutedRef.current = newMuted;
    playToggleSound('mute', newMuted);
    if (channelId) {
      voiceApi.setState(channelId, { is_muted: newMuted, is_deafened: deafenedRef.current }).catch(console.error);
    }
  }, [channelId]);

  const toggleDeafen = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const newDeafened = !deafenedRef.current;
    setIsDeafened(newDeafened);
    deafenedRef.current = newDeafened;
    playToggleSound('deafen', newDeafened);

    if (newDeafened) {
      preDeafenMuteRef.current = mutedRef.current;
      stream.getAudioTracks().forEach((t) => { t.enabled = false; });
      setIsMuted(true);
      mutedRef.current = true;
    } else {
      const restoreMuted = preDeafenMuteRef.current;
      stream.getAudioTracks().forEach((t) => { t.enabled = !restoreMuted; });
      setIsMuted(restoreMuted);
      mutedRef.current = restoreMuted;
    }

    peersRef.current.forEach(({ audioEl }) => {
      if (audioEl) audioEl.muted = newDeafened;
    });

    if (channelId) {
      voiceApi.setState(channelId, {
        is_muted: mutedRef.current,
        is_deafened: newDeafened,
      }).catch(console.error);
    }
  }, [channelId]);

  return { inCall, channelId, participants, localStream, isMuted, isDeafened, joinChannel, leaveChannel, toggleMute, toggleDeafen };
}
