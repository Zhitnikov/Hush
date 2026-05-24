import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PhoneOff, Video as VideoIcon, VideoOff as VideoOffIcon, Mic, MicOff, User } from 'lucide-react';
import clsx from 'clsx';
import api from '../utils/apiClient';
import { requestUserMedia, getMediaUnavailableReason } from '../utils/mediaDevices';
import { waitIceGatheringComplete, toSessionDescription, DEFAULT_ICE_SERVERS } from '../utils/webrtcCall';

export default function CallInterface({ callData, socket, currentUser, onEnd }) {
    const [remoteStream, setRemoteStream] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(callData.type === 'audio');
    const [callStatus, setCallStatus] = useState(callData.isReceiver ? 'ringing' : 'dialing');
    const [quality, setQuality] = useState('good');
    const [mediaError, setMediaError] = useState(null);

    const myVideo = useRef(null);
    const remoteVideo = useRef(null);
    const remoteAudio = useRef(null);
    const peerConnection = useRef(null);
    const localStreamRef = useRef(null);
    const callTimeoutRef = useRef(null);
    const connectedRef = useRef(false);
    const pendingIceRef = useRef([]);
    const pendingAnswerRef = useRef(null);
    const remoteReadyRef = useRef(false);
    const mountedRef = useRef(true);

    const peerId = String(callData.targetId);

    const attachLocalPreview = useCallback(() => {
        const stream = localStreamRef.current;
        if (myVideo.current && stream) {
            myVideo.current.srcObject = stream;
            myVideo.current.play().catch(() => {});
        }
    }, []);

    const drainIceCandidates = useCallback(async () => {
        const pc = peerConnection.current;
        if (!pc || !remoteReadyRef.current) return;
        const pending = pendingIceRef.current.splice(0);
        for (const candidate of pending) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.warn('ICE candidate failed', e);
            }
        }
    }, []);

    const addIceCandidateSafe = useCallback(async (candidate) => {
        if (!candidate) return;
        const pc = peerConnection.current;
        if (!pc) return;
        if (!remoteReadyRef.current) {
            pendingIceRef.current.push(candidate);
            return;
        }
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            pendingIceRef.current.push(candidate);
        }
    }, []);

    useEffect(() => {
        if (remoteStream) {
            const el = callData.type === 'video' ? remoteVideo.current : remoteAudio.current;
            if (el) {
                el.srcObject = remoteStream;
                el.play().catch(() => {});
            }
        }
    }, [remoteStream, callData.type]);

    useEffect(() => {
        attachLocalPreview();
    }, [isVideoOff, attachLocalPreview]);

    useEffect(() => {
        mountedRef.current = true;

        const cleanup = () => {
            if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach((t) => t.stop());
                localStreamRef.current = null;
            }
            if (peerConnection.current) {
                peerConnection.current.close();
                peerConnection.current = null;
            }
            remoteReadyRef.current = false;
            pendingIceRef.current = [];
            pendingAnswerRef.current = null;
        };

        const markConnected = () => {
            if (!mountedRef.current) return;
            connectedRef.current = true;
            setCallStatus('connected');
            setQuality('good');
        };

        const applyAnswer = async (answer) => {
            const desc = toSessionDescription(answer);
            if (!desc) return false;
            const pc = peerConnection.current;
            if (!pc) {
                pendingAnswerRef.current = desc;
                return false;
            }
            try {
                await pc.setRemoteDescription(desc);
                remoteReadyRef.current = true;
                await drainIceCandidates();
                markConnected();
                return true;
            } catch (e) {
                console.error('setRemoteDescription (answer)', e);
                return false;
            }
        };

        const handleAnswer = async (payload) => {
            const answer = payload?.answer ?? payload;
            await applyAnswer(answer);
        };

        const handleSignal = async (payload) => {
            const signal = payload?.signal ?? payload;
            if (!signal) return;
            if (signal.type === 'candidate' && signal.candidate) {
                await addIceCandidateSafe(signal.candidate);
                return;
            }
            if (signal.type === 'answer' || (signal.sdp && signal.type)) {
                await applyAnswer(signal);
            }
        };

        const handleEnded = () => {
            cleanup();
            onEnd();
        };

        const initCall = async () => {
            if (!socket?.connected) {
                setMediaError('Нет соединения с сервером. Проверьте сеть и обновите страницу.');
                return;
            }

            try {
                let iceServers = [...DEFAULT_ICE_SERVERS.iceServers];
                try {
                    const { data } = await api.get('/api/config/webrtc');
                    if (data?.iceServers?.length) iceServers = [...iceServers, ...data.iceServers];
                } catch {  }

                const localStream = await requestUserMedia({
                    video: callData.type === 'video',
                    audio: { echoCancellation: true, noiseSuppression: true },
                });
                if (!mountedRef.current) {
                    localStream.getTracks().forEach((t) => t.stop());
                    return;
                }
                localStreamRef.current = localStream;
                attachLocalPreview();

                const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4 });
                peerConnection.current = pc;

                localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

                pc.ontrack = (event) => {
                    if (!mountedRef.current) return;
                    const stream = event.streams?.[0] || new MediaStream([event.track]);
                    setRemoteStream(stream);
                    markConnected();
                };

                pc.onicecandidate = (event) => {
                    if (!event.candidate) return;
                    socket.emit('webrtc_signal', {
                        to: peerId,
                        signal: {
                            type: 'candidate',
                            candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
                        },
                    });
                };

                pc.onconnectionstatechange = () => {
                    const st = pc.connectionState;
                    if (st === 'connected') markConnected();
                    else if (st === 'failed') {
                        setQuality('poor');
                        try { pc.restartIce(); } catch {  }
                    } else if (st === 'disconnected') setQuality('poor');
                };

                pc.oniceconnectionstatechange = () => {
                    const ice = pc.iceConnectionState;
                    if (ice === 'connected' || ice === 'completed') markConnected();
                    if (ice === 'failed') {
                        try { pc.restartIce(); } catch {  }
                    }
                };

                if (callData.isReceiver) {
                    const offer = toSessionDescription(callData.offer);
                    if (!offer) throw new Error('Некорректное приглашение звонка');

                    await pc.setRemoteDescription(offer);
                    remoteReadyRef.current = true;
                    await drainIceCandidates();

                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    await waitIceGatheringComplete(pc);

                    socket.emit('answer_call', {
                        to: peerId,
                        answer: pc.localDescription,
                    });
                } else {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    await waitIceGatheringComplete(pc);

                    socket.emit('call_user', {
                        to: peerId,
                        offer: pc.localDescription,
                        name: currentUser.username,
                        type: callData.type,
                    });

                    if (pendingAnswerRef.current) {
                        await applyAnswer(pendingAnswerRef.current);
                        pendingAnswerRef.current = null;
                    }

                    callTimeoutRef.current = setTimeout(() => {
                        if (mountedRef.current && !connectedRef.current) {
                            socket.emit('end_call', { to: peerId });
                            handleEnded();
                        }
                    }, 60000);
                }
            } catch (err) {
                console.error('Call init failed', err);
                if (mountedRef.current) {
                    setMediaError(err.message || getMediaUnavailableReason());
                }
                cleanup();
            }
        };

        socket.on('call_answered', handleAnswer);
        socket.on('webrtc_signal', handleSignal);
        socket.on('call_ended', handleEnded);

        initCall();

        return () => {
            mountedRef.current = false;
            socket.off('call_answered', handleAnswer);
            socket.off('webrtc_signal', handleSignal);
            socket.off('call_ended', handleEnded);
            cleanup();
        };
    }, [callData.isReceiver, callData.type, callData.offer, socket, currentUser.username, onEnd, peerId, attachLocalPreview, addIceCandidateSafe, drainIceCandidates]);

    const toggleMute = () => {
        const s = localStreamRef.current;
        if (!s) return;
        const audioTrack = s.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            setIsMuted(!audioTrack.enabled);
        }
    };

    const toggleVideo = () => {
        const s = localStreamRef.current;
        if (!s || callData.type !== 'video') return;
        const videoTrack = s.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            setIsVideoOff(!videoTrack.enabled);
            attachLocalPreview();
        }
    };

    const hangUp = () => {
        if (socket?.connected) socket.emit('end_call', { to: peerId });
        onEnd();
    };

    if (mediaError) {
        return (
            <div className="fixed inset-0 z-[100] bg-[#17212b] flex flex-col items-center justify-center p-6">
                <div className="bg-[#0e1621] border border-white/10 rounded-2xl p-6 max-w-md w-full text-center">
                    <p className="text-white font-semibold mb-2">Звонок недоступен</p>
                    <p className="text-[#6ab2f2] text-sm leading-relaxed mb-6">{mediaError}</p>
                    <button type="button" onClick={onEnd} className="w-full py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700">
                        Закрыть
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] bg-[#17212b] flex flex-col items-center justify-center">
            <audio ref={remoteAudio} autoPlay playsInline className="hidden" />
            <div className="relative w-full max-w-3xl aspect-video bg-[#0e1621] rounded-xl overflow-hidden border border-white/5">
                <div className="absolute inset-0 flex items-center justify-center">
                    {remoteStream && callData.type === 'video' ? (
                        <video
                            ref={remoteVideo}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-20 h-20 rounded-full bg-[#2b5278] flex items-center justify-center">
                                <User size={40} className="text-[#6ab2f2]" />
                            </div>
                            <p className="text-[#6ab2f2] text-sm uppercase tracking-wider">{callStatus}…</p>
                            {callData.type === 'audio' && remoteStream && (
                                <p className="text-[#6ab2f2]/70 text-xs">Аудиозвонок</p>
                            )}
                        </div>
                    )}
                </div>

                <div className="absolute top-4 right-4 w-40 aspect-video bg-black/40 rounded-lg overflow-hidden border border-white/10">
                    {callData.type === 'video' && !isVideoOff ? (
                        <video ref={myVideo} autoPlay muted playsInline className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <User size={24} className="text-white/70" />
                        </div>
                    )}
                </div>

                <div className="absolute top-4 left-4 flex gap-2 text-white text-xs">
                    <span className="bg-black/40 px-2 py-1 rounded">{callData.name}</span>
                    <span className={clsx('px-2 py-1 rounded', quality === 'good' ? 'bg-emerald-600/80' : 'bg-amber-600/80')}>
                        {quality === 'good' ? 'Связь хорошая' : 'Слабая связь'}
                    </span>
                </div>

                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4">
                    <button type="button" onClick={toggleMute} className={clsx('p-3 rounded-full', isMuted ? 'bg-red-500' : 'bg-white/15 text-white')}>
                        {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                    </button>
                    {callData.type === 'video' && (
                        <button type="button" onClick={toggleVideo} className={clsx('p-3 rounded-full', isVideoOff ? 'bg-red-500' : 'bg-white/15 text-white')}>
                            {isVideoOff ? <VideoOffIcon size={22} /> : <VideoIcon size={22} />}
                        </button>
                    )}
                    <button type="button" onClick={hangUp} className="p-4 bg-red-600 text-white rounded-full hover:bg-red-700">
                        <PhoneOff size={26} />
                    </button>
                </div>
            </div>
        </div>
    );
}
