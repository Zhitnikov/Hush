import React, { useState, useEffect, useRef } from 'react';
import { PhoneOff, Video as VideoIcon, VideoOff as VideoOffIcon, Mic, MicOff, User } from 'lucide-react';
import clsx from 'clsx';

export default function CallInterface({ callData, socket, currentUser, onEnd }) {
    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(callData.type === 'audio');
    const [callStatus, setCallStatus] = useState(callData.isReceiver ? 'ringing' : 'dialing');

    const myVideo = useRef();
    const remoteVideo = useRef();
    const peerConnection = useRef();

    const servers = {
        iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }]
    };

    useEffect(() => {
        const initCall = async () => {
            try {
                const localStream = await navigator.mediaDevices.getUserMedia({
                    video: callData.type === 'video',
                    audio: true
                });
                setStream(localStream);
                if (myVideo.current) myVideo.current.srcObject = localStream;

                peerConnection.current = new RTCPeerConnection(servers);
                localStream.getTracks().forEach(track => peerConnection.current.addTrack(track, localStream));

                peerConnection.current.ontrack = (event) => {
                    setRemoteStream(event.streams[0]);
                    if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0];
                };

                peerConnection.current.onicecandidate = (event) => {
                    if (event.candidate) {
                        socket.emit('webrtc_signal', { to: callData.targetId, signal: { type: 'candidate', candidate: event.candidate } });
                    }
                };

                if (callData.isReceiver) {
                    await peerConnection.current.setRemoteDescription(new RTCSessionDescription(callData.offer));
                    const answer = await peerConnection.current.createAnswer();
                    await peerConnection.current.setLocalDescription(answer);
                    socket.emit('answer_call', { to: callData.targetId, answer });
                    setCallStatus('connected');
                } else {
                    const offer = await peerConnection.current.createOffer();
                    await peerConnection.current.setLocalDescription(offer);
                    socket.emit('call_user', {
                        to: callData.targetId,
                        offer,
                        from: currentUser.id,
                        name: currentUser.username,
                        type: callData.type
                    });
                }
            } catch (err) {
                console.error("Call initialization failed", err);
                onEnd();
            }
        };

        initCall();

        const handleAnswer = async ({ answer }) => {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
            setCallStatus('connected');
        };

        const handleSignal = async ({ signal }) => {
            if (signal.type === 'candidate' && peerConnection.current) {
                await peerConnection.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
        };

        socket.on('call_answered', handleAnswer);
        socket.on('webrtc_signal', handleSignal);
        socket.on('call_ended', onEnd);

        return () => {
            socket.off('call_answered');
            socket.off('webrtc_signal');
            socket.off('call_ended');
            if (stream) stream.getTracks().forEach(track => track.stop());
            if (peerConnection.current) peerConnection.current.close();
        };
    }, []);

    const toggleMute = () => {
        if (stream) {
            const audioTrack = stream.getAudioTracks()[0];
            audioTrack.enabled = !audioTrack.enabled;
            setIsMuted(!audioTrack.enabled);
        }
    };

    const toggleVideo = () => {
        if (stream && callData.type === 'video') {
            const videoTrack = stream.getVideoTracks()[0];
            videoTrack.enabled = !videoTrack.enabled;
            setIsVideoOff(!videoTrack.enabled);
        }
    };

    const hangUp = () => {
        socket.emit('end_call', { to: callData.targetId });
        onEnd();
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center fade-in">
            <div className="relative w-full max-w-4xl aspect-video bg-[#17212B] rounded-3xl overflow-hidden shadow-2xl border border-white/5">

                <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                    {remoteStream ? (
                        <video ref={remoteVideo} autoPlay playsInline className="w-full h-full object-cover" />
                    ) : (
                        <div className="flex flex-col items-center space-y-4 animate-pulse">
                            <div className="w-24 h-24 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                                <User size={48} className="text-blue-400" />
                            </div>
                            <p className="text-blue-400 font-bold uppercase tracking-widest text-sm">{callStatus}...</p>
                        </div>
                    )}
                </div>

                <div className="absolute top-6 right-6 w-48 aspect-video bg-black/50 rounded-2xl border border-white/10 overflow-hidden shadow-xl z-20 transition-all hover:scale-105">
                    {callData.type === 'video' ? (
                        <video ref={myVideo} autoPlay muted playsInline className={clsx("w-full h-full object-cover", isVideoOff && "hidden")} />
                    ) : null}
                    {(callData.type === 'audio' || isVideoOff) && (
                        <div className="w-full h-full flex items-center justify-center bg-[#2B5278]/20">
                            <div className="w-10 h-10 rounded-full bg-blue-500/40 flex items-center justify-center ring-4 ring-blue-500/10">
                                <User size={20} className="text-white" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="absolute top-6 left-6 z-20 flex items-center gap-3">
                    <div className="px-3 py-1.5 bg-black/40 backdrop-blur-lg rounded-full border border-white/10 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase text-white tracking-widest">{callData.name}</span>
                    </div>
                    <div className="px-3 py-1.5 bg-black/40 backdrop-blur-lg rounded-full border border-white/10">
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{callData.type} call</span>
                    </div>
                </div>

                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-6 z-30 transition-all duration-300">
                    <button onClick={toggleMute} className={clsx(
                        "p-4 rounded-2xl transition-all active:scale-90",
                        isMuted ? "bg-red-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                    )}>
                        {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                    </button>

                    {callData.type === 'video' && (
                        <button onClick={toggleVideo} className={clsx(
                            "p-4 rounded-2xl transition-all active:scale-90",
                            isVideoOff ? "bg-red-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                        )}>
                            {isVideoOff ? <VideoOffIcon size={24} /> : <VideoIcon size={24} />}
                        </button>
                    )}

                    <button onClick={hangUp} className="p-5 bg-red-600 text-white rounded-[24px] hover:bg-red-700 active:scale-90 shadow-2xl shadow-red-600/30 transition-all rotate-135">
                        <PhoneOff size={30} fill="currentColor" />
                    </button>
                </div>
            </div>
        </div>
    );
}
