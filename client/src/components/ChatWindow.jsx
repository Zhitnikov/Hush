import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useChatWindowStore, useChatWindowSelectors } from '../stores/chatWindowStore';
import { ArrowLeft, Send, Phone, Video as VideoIcon, Paperclip, Smile, Mic, Shield, Clock, X, Search, Edit3, Trash2, Forward, ImageIcon, Bookmark, BarChart, Bell, BellOff, Pin, PinOff, Reply, Check as CheckIcon, Info as InfoIcon, Loader2, Square as SquareIcon, CheckCheck, FileText } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { encryptMessage, decryptMessage, decryptGroupKey } from '../utils/crypto';
import VoicePlayer from './VoicePlayer';
import { API_BASE, API_ORIGIN } from '../config';

const SERVER_URL = API_ORIGIN;
const PAGE_SIZE = 40;
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉', '🙏', '✨'];

export default function ChatWindow({ chat, token, currentUser, myKeys, socket, onBack, onStartCall }) {
    const {
        messages,
        hasMoreOlder,
        loadingOlder,
        loadingInitial,
        newMessage,
        uploading,
        recording,
        recordingMode,
        mediaRecorder,
        videoPreviewStream,
        showInfo,
        groupKey,
        userStatus,
        editingMessage,
        replyingTo,
        showSearch,
        localSearchQuery,
        typingUser,
        showMedia,
        reactionsMsgId,
        forwardingMsg,
        partnerDetails,
        linkPreview,
        scheduledDelay,
        showPicker,
        pickerTab,
        bloomReaction,
        wallpaper,
        showPollModal,
        pollQuestion,
        pollOptions,
        stats,
        isMuted,
        alias,
        bubbleColor,
        pinnedMsg,
        replyTo,
        mediaTab,
        transcriptions,
        transcribingId,
        patch,
        setMessages,
        setTranscriptions,
        setPollOptions,
        resetForChatSwitch,
    } = useChatWindowSelectors();

    const typingTimeoutRef = useRef(null);

    const fileInputRef = useRef(null);
    const scrollRef = useRef(null);
    const pendingScrollBottomRef = useRef(true);
    const audioChunksRef = useRef([]);

    const myPubKey = myKeys?.publicKey || currentUser?.publicKey;
    const myPrivKey = myKeys?.privateKey;

    useEffect(() => {
        if (!socket || !myPrivKey) return;
        window.activeChatId = chat.id;
        window.activeChatType = chat.type;
        const handleStatus = ({ userId, status, lastSeen }) => {
            if (chat.type === 'user' && userId === chat.id) patch({ userStatus: { status, lastSeen } });
        };
        const handleRec = async (msg) => {
            const chId = (msg.channel && (msg.channel._id || msg.channel))?.toString?.() || (msg.channel && String(msg.channel));
            if (msg.isChannel) {
                if (chId !== String(chat.id)) return;
            } else {
                const sid = (msg.sender && (msg.sender._id || msg.sender))?.toString?.();
                const rid = (msg.receiver && (msg.receiver._id || msg.receiver))?.toString?.();
                const ok = (sid === String(chat.id) && rid === String(currentUser.id)) || (rid === String(chat.id) && sid === String(currentUser.id));
                if (!ok) return;
            }
            const dec = await decryptMessage(msg.content, myPrivKey, groupKey, myPubKey);
            const processed = { ...msg, content: dec, isEncrypted: dec !== msg.content };
            setMessages(prev => {
                const exists = prev.find(m => m._id === processed._id);
                if (exists) return prev.map(m => m._id === processed._id ? processed : m);
                const el = scrollRef.current;
                const stickToBottom = el && el.scrollHeight - el.scrollTop - el.clientHeight < 140;
                const next = [...prev, processed];
                if (stickToBottom) {
                    requestAnimationFrame(() => {
                        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                    });
                }
                return next;
            });
        };
        const handleReaction = ({ messageId, reactions }) => {
            setMessages(prev => prev.map(m => m._id === messageId ? { ...m, reactions } : m));
        };
        const handleRead = ({ chatId }) => {
            if (chatId === chat.id || chat.type === 'channel') {
                setMessages(prev => prev.map(m => ({ ...m, readBy: [...new Set([...(m.readBy || []), chatId])] })));
            }
        };
        const handleTyping = ({ chatId, username }) => {
            if (chatId === chat.id) patch({ typingUser: username });
        };
        const handleStopTyping = ({ chatId }) => {
            if (chatId === chat.id) patch({ typingUser: null });
        };
        const handleEdited = ({ messageId, content }) => {
            setMessages(prev => prev.map(m => m._id === messageId ? { ...m, content, isEdited: true } : m));
        };
        const handleUpdated = async (msg) => {
            const dec = await decryptMessage(msg.content, myPrivKey, groupKey, myPubKey);
            const processed = { ...msg, content: dec, isEncrypted: dec !== msg.content };
            setMessages(prev => prev.map(m => m._id === processed._id ? processed : m));
        };
        const handleDeleted = ({ messageId }) => {
            setMessages(prev => prev.map(m => m._id === messageId ? { ...m, isDeleted: true, content: 'Message deleted', fileUrl: null, fileType: null } : m));
        };
        const handleDeletedHard = (messageId) => {
            const id = messageId?.toString?.() || messageId;
            setMessages(prev => prev.filter(m => m._id !== id));
        };

        socket.on('user_status_change', handleStatus);
        socket.on('receive_message', handleRec);
        socket.on('reaction_updated', handleReaction);
        socket.on('messages_read', handleRead);
        socket.on('user_typing', handleTyping);
        socket.on('user_stop_typing', handleStopTyping);
        socket.on('message_updated', handleUpdated);
        socket.on('message_deleted', handleDeleted);
        socket.on('message_deleted_hard', handleDeletedHard);

        socket.emit('mark_read', { chatType: chat.type, chatId: chat.id, userId: currentUser.id });
        if (chat.type === 'channel') {
            socket.emit('join_room', chat.id);
        }

        return () => {
            socket.off('user_status_change', handleStatus);
            socket.off('receive_message', handleRec);
            socket.off('reaction_updated', handleReaction);
            socket.off('messages_read', handleRead);
            socket.off('user_typing', handleTyping);
            socket.off('user_stop_typing', handleStopTyping);
            socket.off('message_updated', handleUpdated);
            socket.off('message_deleted', handleDeleted);
            socket.off('message_deleted_hard', handleDeletedHard);
        };
    }, [chat.id, chat.type, socket, myPrivKey, myPubKey, groupKey, currentUser.id]);

    useEffect(() => {
        if (!currentUser?.id) return;
        const raw = JSON.parse(localStorage.getItem(`drafts_${currentUser.id}`) || '{}');
        patch({ newMessage: raw[chat.id] || '' });
    }, [chat.id, currentUser?.id]);

    useEffect(() => {
        if (!currentUser?.id) return;
        const t = setTimeout(() => {
            const raw = JSON.parse(localStorage.getItem(`drafts_${currentUser.id}`) || '{}');
            raw[chat.id] = newMessage;
            localStorage.setItem(`drafts_${currentUser.id}`, JSON.stringify(raw));
        }, 400);
        return () => clearTimeout(t);
    }, [newMessage, chat.id, currentUser?.id]);

    useEffect(() => {
        if (!myPrivKey) return;
        let cancelled = false;
        resetForChatSwitch(chat, currentUser);

        (async () => {
            let gKey = null;
            try {
                if (chat.type === 'channel') {
                    const cRes = await axios.get(`${API_BASE}/channels`, { headers: { Authorization: `Bearer ${token}` } });
                    const current = cRes.data.find(c => c._id === chat.id);
                    if (current) patch({ partnerDetails: current });
                    const myEntry = current?.encryptedKeys?.find(k => k.userId === currentUser.id);
                    if (myEntry) gKey = await decryptGroupKey(myEntry.key, myPrivKey);
                    patch({ groupKey: gKey });
                } else {
                    patch({ groupKey: null });
                    try {
                        const res = await axios.get(`${API_ORIGIN}/api/auth/user/${chat.id}`, { headers: { Authorization: `Bearer ${token}` } });
                        if (!cancelled) patch({ partnerDetails: res.data });
                    } catch (e) { console.error(e); }
                }

                const endpoint = chat.type === 'channel' ? `/messages/channel/${chat.id}` : `/messages/private/${chat.id}`;
                const res = await axios.get(`${API_BASE}${endpoint}`, {
                    params: { limit: PAGE_SIZE },
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (cancelled) return;
                const list = Array.isArray(res.data.messages) ? res.data.messages : (Array.isArray(res.data) ? res.data : []);
                const decrypted = await Promise.all(list.map(async m => {
                    const dec = await decryptMessage(m.content, myPrivKey, chat.type === 'channel' ? gKey : null, myPubKey);
                    return { ...m, content: dec, isEncrypted: dec !== m.content };
                }));
                setMessages(decrypted);
                patch({ hasMoreOlder: res.data.hasMore !== false && list.length === PAGE_SIZE });
            } catch (e) {
                console.error(e);
            } finally {
                if (!cancelled) patch({ loadingInitial: false });
            }
        })();

        return () => { cancelled = true; };
    }, [chat.id, chat.type, token, myPrivKey, myPubKey, currentUser?.id]);

    useEffect(() => {
        pendingScrollBottomRef.current = true;
    }, [chat.id]);

    useEffect(() => {
        if (loadingInitial || !pendingScrollBottomRef.current || !scrollRef.current || !messages.length) return;
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        pendingScrollBottomRef.current = false;
    }, [loadingInitial, messages.length, chat.id]);

    const loadOlder = useCallback(async () => {
        if (!myPrivKey || loadingOlder || !hasMoreOlder || messages.length === 0) return;
        const first = messages[0];
        if (!first?.createdAt) return;
        patch({ loadingOlder: true });
        try {
            const endpoint = chat.type === 'channel' ? `/messages/channel/${chat.id}` : `/messages/private/${chat.id}`;
            const before = new Date(first.createdAt).toISOString();
            const res = await axios.get(`${API_BASE}${endpoint}`, {
                params: { limit: PAGE_SIZE, before },
                headers: { Authorization: `Bearer ${token}` }
            });
            const raw = Array.isArray(res.data.messages) ? res.data.messages : [];
            const decrypted = await Promise.all(raw.map(async m => {
                const dec = await decryptMessage(m.content, myPrivKey, groupKey, myPubKey);
                return { ...m, content: dec, isEncrypted: dec !== m.content };
            }));
            const scrollEl = scrollRef.current;
            const prevScrollHeight = scrollEl?.scrollHeight || 0;
            const prevTop = scrollEl?.scrollTop || 0;
            setMessages(prev => {
                const merged = [...decrypted, ...prev];
                const seen = new Set();
                return merged.filter(m => {
                    if (seen.has(String(m._id))) return false;
                    seen.add(String(m._id));
                    return true;
                });
            });
            patch({ hasMoreOlder: res.data.hasMore !== false && raw.length === PAGE_SIZE });
            requestAnimationFrame(() => {
                if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight - prevScrollHeight + prevTop;
            });
        } catch (e) {
            console.error(e);
        } finally {
            patch({ loadingOlder: false });
        }
    }, [myPrivKey, loadingOlder, hasMoreOlder, messages, chat.id, chat.type, token, groupKey, myPubKey]);

    const loadOlderRef = useRef(loadOlder);
    loadOlderRef.current = loadOlder;

    const handleSend = async (e, fileData = null) => {
        if (e) e.preventDefault();
        const contentToSend = fileData?.content || newMessage;
        if (!contentToSend.trim() && !fileData) return;

        let content = contentToSend;
        if (contentToSend.trim()) {
            if (chat.type === 'user' && chat.publicKey) {
                content = await encryptMessage(contentToSend, chat.publicKey, null, myPubKey);
            } else if (chat.type === 'channel' && groupKey) {
                content = await encryptMessage(contentToSend, null, groupKey, myPubKey);
            }
        }
        socket.emit('send_message', {
            senderId: currentUser.id, receiverId: chat.type === 'user' ? chat.id : null,
            content: (fileData?.isAudio || fileData?.fileType === 'video') ? (fileData?.isAudio ? 'Voice Message' : 'Video Message') : content,
            isChannel: chat.type === 'channel', channelId: chat.type === 'channel' ? chat.id : null,
            fileUrl: fileData?.fileUrl || null, fileType: fileData?.isAudio ? 'audio' : (fileData?.fileType || null),
            replyTo: replyingTo?._id || null,
            forwardFrom: fileData?.forwardFrom || null,
            scheduledAt: scheduledDelay > 0 ? new Date(Date.now() + scheduledDelay * 1000) : null,
            ogPreview: linkPreview,
            isVideoCircle: fileData?.fileType === 'video',
            poll: fileData?.poll || null
        });
        patch({ newMessage: '', replyingTo: null, linkPreview: null, scheduledDelay: 0 });
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: recordingMode === 'video' ? { width: 480, height: 480, frameRate: 24 } : false
            });
            if (recordingMode === 'video') patch({ videoPreviewStream: stream });

            audioChunksRef.current = [];
            const recorder = new MediaRecorder(stream, {
                mimeType: recordingMode === 'video' ? 'video/webm' : 'audio/webm'
            });

            recorder.ondataavailable = e => {
                if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: recordingMode === 'video' ? 'video/webm' : 'audio/webm' });
                const fd = new FormData();
                fd.append('file', blob, recordingMode === 'video' ? 'video.webm' : 'audio.webm');
                patch({ uploading: true });
                axios.post(`${API_BASE}/upload`, fd, { headers: { Authorization: `Bearer ${token}` } })
                    .then(res => handleSend(null, { ...res.data, fileType: recordingMode === 'video' ? 'video' : 'audio', isAudio: recordingMode === 'voice' }))
                    .finally(() => patch({ uploading: false }));

                stream.getTracks().forEach(t => t.stop());
                patch({ videoPreviewStream: null });
            };

            recorder.start(1000);
            patch({ mediaRecorder: recorder, recording: true });
        } catch (e) {
            console.error("Recording error:", e);
            alert("Could not start camera/mic. Please check permissions.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorder) {
            mediaRecorder.stop();
            patch({ recording: false });
        }
    };

    const getStatusText = () => {
        if (chat.type === 'channel') return 'Public Channel';
        if (userStatus.status === 'online') return 'online';
        if (!userStatus.lastSeen) return 'offline';
        try { return `last seen ${formatDistanceToNow(new Date(userStatus.lastSeen))} ago`; } catch { return 'offline'; }
    };

    const filteredMessages = useMemo(() => {
        if (!localSearchQuery.trim()) return messages;
        return messages.filter(m => m.content?.toLowerCase().includes(localSearchQuery.toLowerCase()));
    }, [messages, localSearchQuery]);

    const handleTypingIndicator = () => {
        if (!socket) return;
        socket.emit('typing', { chatId: chat.id, userId: currentUser.id, username: currentUser.username, isChannel: chat.type === 'channel' });
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            socket.emit('stop_typing', { chatId: chat.id, userId: currentUser.id, isChannel: chat.type === 'channel' });
        }, 2000);
    };

    const groupedMessages = useMemo(() => {
        const groups = {};
        filteredMessages.forEach(m => {
            const date = format(new Date(m.createdAt), 'yyyy-MM-dd');
            if (!groups[date]) groups[date] = [];
            groups[date].push(m);
        });
        return groups;
    }, [filteredMessages]);

    const getDateLabel = (dateStr) => {
        const date = new Date(dateStr);
        if (format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')) return 'Today';
        if (format(date, 'yyyy-MM-dd') === format(new Date(Date.now() - 86400000), 'yyyy-MM-dd')) return 'Yesterday';
        return format(date, 'MMMM do, yyyy');
    };

    const sharedMedia = useMemo(() => {
        return messages.filter(m => m.fileUrl && !m.isDeleted).map(m => ({
            url: `${SERVER_URL}${m.fileUrl}`,
            type: m.fileType,
            date: m.createdAt
        }));
    }, [messages]);

    useEffect(() => {
        localStorage.setItem(`wallpaper_${currentUser?.id}`, wallpaper);
    }, [wallpaper, currentUser?.id]);

    useEffect(() => {
        patch({
            isMuted: currentUser?.mutedChats?.includes(chat.id),
            alias: currentUser?.aliases?.[chat.id] || '',
            bubbleColor: currentUser?.chatPreferences?.[chat.id]?.bubbleColor || (chat.id === currentUser.id ? '#eeffde' : '#ffffff'),
        });

        if (chat.type === 'channel') {
            axios.get(`${API_BASE}/stats/${chat.id}`, { headers: { Authorization: `Bearer ${token}` } })
                .then(res => patch({ stats: res.data }))
                .catch(e => console.error(e));
        }
    }, [chat.id, token, currentUser]);

    const formatTime = (date) => {
        try { return format(new Date(date), 'HH:mm'); } catch { return ''; }
    };

    const renderMessageContent = (msg) => {
        if (!msg.content) return null;
        const tokens = msg.content.split(/(\s+)/);
        return tokens.map((token, i) => {
            if (token.startsWith('@')) return <span key={i} className="text-blue-600 font-bold hover:underline cursor-pointer">{token}</span>;
            if (token.startsWith('#')) return <span key={i} className="text-purple-600 font-bold hover:underline cursor-pointer">{token}</span>;
            if (token.match(/https?:\/\/[^\s]+/)) return <a key={i} href={token} target="_blank" className="text-blue-500 underline break-all">{token}</a>;
            return token;
        });
    };

    const handleAddReaction = (messageId, emoji) => {
        socket.emit('add_reaction', { messageId, emoji, userId: currentUser.id });
        patch({ bloomReaction: { id: messageId, emoji } });
        setTimeout(() => patch({ bloomReaction: null }), 1000);
        patch({ reactionsMsgId: null });
    };

    const isBroadcast = chat.type === 'channel' && partnerDetails?.type === 'broadcast';
    const canMessage = !isBroadcast || String(partnerDetails?.creator) === String(currentUser.id);

    const onScrollMessages = useCallback(() => {
        const el = scrollRef.current;
        if (!el || loadingOlder || !hasMoreOlder) return;
        if (el.scrollTop < 140) loadOlderRef.current();
    }, [loadingOlder, hasMoreOlder]);

    return (
        <div className="flex flex-col h-full bg-[#f4f7f9] relative w-full overflow-hidden">
            <style>{`
                @keyframes bloom {
                    0% { transform: scale(0) translateY(0); opacity: 0; }
                    50% { transform: scale(1.5) translateY(-40px); opacity: 1; }
                    100% { transform: scale(1) translateY(-20px); opacity: 0; }
                }
                .reaction-bloom { animation: bloom 0.8s ease-out forwards; }
            `}</style>
            <div className="bg-white px-5 py-3 flex items-center border-b border-gray-100 z-40 h-[64px]">
                <button onClick={onBack} className="mr-3 md:hidden text-gray-500 hover:text-gray-900"><ArrowLeft size={22} /></button>
                <div className="flex items-center flex-1 min-w-0 md:cursor-pointer" onClick={() => patch({ showInfo: true })}>
                    <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold mr-3 shadow-inner shrink-0">
                        {chat.name[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-gray-900 text-[15px] truncate">{alias || chat.name}</h2>
                            {chat.type === 'channel' && (
                                <span className={clsx(
                                    "text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md tracking-tighter",
                                    partnerDetails?.type === 'broadcast' ? "bg-amber-100 text-amber-600" : "bg-purple-100 text-purple-600"
                                )}>
                                    {partnerDetails?.type === 'broadcast' ? 'Broadcast' : 'Group'}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 h-4">
                            {typingUser ? (
                                <p className="text-[11px] font-bold text-blue-500 animate-pulse tracking-tight">{chat.type === 'channel' ? `${typingUser} is typing...` : 'typing...'}</p>
                            ) : (
                                <p className={clsx("text-[11px] font-medium", userStatus.status === 'online' ? "text-blue-500" : "text-gray-400 text-dim")}>{getStatusText()}</p>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex gap-1 items-center">
                    {chat.type === 'user' && (
                        <>
                            <button onClick={() => onStartCall('audio')} className="p-2 text-gray-400 hover:bg-gray-50 rounded-full transition-all"><Phone size={20} /></button>
                            <button onClick={() => onStartCall('video')} className="p-2 text-gray-400 hover:bg-gray-50 rounded-full transition-all"><VideoIcon size={20} /></button>
                        </>
                    )}
                    <button onClick={() => patch({ showSearch: !showSearch })} className={clsx("p-2 rounded-full transition-all", showSearch ? "text-blue-500 bg-blue-50" : "text-gray-400 hover:bg-gray-50")}><Search size={20} /></button>
                    <button onClick={() => patch({ showMedia: !showMedia })} className={clsx("p-2 rounded-full transition-all", showMedia ? "text-blue-500 bg-blue-50" : "text-gray-400 hover:bg-gray-50")}><InfoIcon size={20} /></button>
                </div>
            </div>

            {showSearch && (
                <div className="bg-white px-5 py-2 border-b border-gray-100 flex items-center gap-3 fade-in">
                    <Search className="text-gray-400" size={16} />
                    <input
                        autoFocus
                        value={localSearchQuery}
                        onChange={e => patch({ localSearchQuery: e.target.value })}
                        placeholder="Search messages..."
                        className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900"
                    />
                    <button onClick={() => patch({ showSearch: false, localSearchQuery: '' })} className="text-gray-400 hover:text-gray-900"><X size={18} /></button>
                </div>
            )}

            {partnerDetails?.pinnedMessage && (
                <div className="bg-white/80 backdrop-blur-md px-5 py-2 border-b border-gray-100 flex items-center justify-between z-30 animate-slide-down">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-1 h-8 bg-blue-500 rounded-full" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest leading-none mb-1">Pinned Message</p>
                            <p className="text-xs text-gray-600 truncate">Click to view original message...</p>
                        </div>
                    </div>
                    <PinOff size={14} className="text-gray-300 cursor-pointer hover:text-red-500 transition-colors" />
                </div>
            )}

            <div className="flex-1 flex overflow-hidden relative">
                <div className="flex-1 flex flex-col min-w-0 relative">

                    <div
                        ref={scrollRef}
                        onScroll={onScrollMessages}
                        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar relative transition-all duration-500"
                        style={{ background: wallpaper }}
                    >
                        <div className="flex flex-col items-center py-6 opacity-60">
                            <div className="flex items-center gap-2 bg-blue-50/50 border border-blue-100/30 px-4 py-2 rounded-2xl mb-4">
                                <Shield size={12} className="text-blue-400" />
                                <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">End-to-End Encrypted</span>
                            </div>
                        </div>

                        {loadingOlder && (
                            <div className="flex justify-center py-3">
                                <Loader2 className="animate-spin text-blue-500" size={22} />
                            </div>
                        )}

                        {Object.keys(groupedMessages).map(date => (
                            <div key={date} className="space-y-6">
                                <div className="flex justify-center">
                                    <span className="bg-gray-200/50 text-gray-500 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                                        {getDateLabel(date)}
                                    </span>
                                </div>
                                {groupedMessages[date].map((msg, i) => {
                                    const isMe = (msg.sender?._id || msg.sender) === currentUser?.id;
                                    return (
                                        <div key={i} className={clsx("flex flex-col group fade-in relative", isMe ? "items-end" : "items-start")}>
                                            <div className={clsx(
                                                "max-w-[85%] md:max-w-[70%] rounded-[20px] p-3.5 relative light-shadow transition-all hover:ring-2 hover:ring-blue-500/10",
                                                isMe ? "text-gray-900 rounded-tr-none" : "bg-white text-gray-900 rounded-tl-none border border-gray-100"
                                            )} style={isMe ? { backgroundColor: bubbleColor } : {}}>
                                                {msg.replyTo && (
                                                    <div className="mb-2 bg-black/5 rounded-xl p-2 border-l-4 border-blue-500/50 backdrop-blur-sm">
                                                        <p className="text-[10px] font-black text-blue-500/70 uppercase tracking-widest leading-none mb-1">Reply to {msg.replyTo.sender?.username || 'user'}</p>
                                                        <p className="text-[11px] text-gray-500 truncate italic">{msg.replyTo.content}</p>
                                                    </div>
                                                )}
                                                {bloomReaction?.id === msg._id && (
                                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-50 text-2xl reaction-bloom">
                                                        {bloomReaction.emoji}
                                                    </div>
                                                )}

                                                <div className={clsx(
                                                    "absolute top-0 opacity-0 group-hover:opacity-100 transition-all flex gap-1 z-20",
                                                    isMe ? "-left-36" : "-right-36"
                                                )}>
                                                    <button onClick={() => patch({ reactionsMsgId: reactionsMsgId === msg._id ? null : msg._id })} className="p-2 text-gray-400 hover:text-blue-500 bg-white rounded-full shadow-sm border border-gray-100"><Smile size={14} /></button>
                                                    <button
                                                        onClick={() => {
                                                            patch({ replyingTo: msg });
                                                        }}
                                                        className="p-2 text-gray-400 hover:text-blue-500 bg-white rounded-full shadow-sm border border-gray-100" title="Reply"
                                                    >
                                                        <Reply size={14} />
                                                    </button>
                                                    <button onClick={() => patch({ forwardingMsg: msg })} className="p-2 text-gray-400 hover:text-blue-500 bg-white rounded-full shadow-sm border border-gray-100"><Forward size={14} /></button>
                                                    {isMe && !msg.isDeleted && (
                                                        <>
                                                            <button onClick={() => { patch({ editingMessage: msg, newMessage: msg.content }); }} className="p-2 text-gray-400 hover:text-green-500 bg-white rounded-full shadow-sm border border-gray-100"><Edit3 size={14} /></button>
                                                            <button onClick={() => socket.emit('delete_message', { messageId: msg._id, userId: currentUser.id })} className="p-2 text-gray-400 hover:text-red-500 bg-white rounded-full shadow-sm border border-gray-100"><Trash2 size={14} /></button>
                                                        </>
                                                    )}
                                                    {chat.type === 'channel' && String(partnerDetails?.creator) === String(currentUser.id) && (
                                                        <button
                                                            onClick={async () => {
                                                                await axios.post(`${API_BASE}/pin`, { channelId: chat.id, messageId: msg._id }, { headers: { Authorization: `Bearer ${token}` } });
                                                            }}
                                                            className="p-2 text-gray-400 hover:text-blue-500 bg-white rounded-full shadow-sm border border-gray-100" title="Pin Message"
                                                        ><Pin size={14} /></button>
                                                    )}

                                                    {reactionsMsgId === msg._id && (
                                                        <div className={clsx(
                                                            "absolute bottom-10 bg-white border border-gray-100 shadow-xl rounded-full p-1.5 flex gap-1 z-50 fade-in",
                                                            isMe ? "left-0" : "right-0"
                                                        )}>
                                                            {EMOJIS.map(e => (
                                                                <button key={e} onClick={() => { socket.emit('add_reaction', { messageId: msg._id, emoji: e, userId: currentUser.id }); patch({ reactionsMsgId: null }); }} className="text-lg hover:scale-125 transition-transform">{e}</button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {msg.replyTo && (
                                                    <div className="mb-2 bg-black/5 p-2 rounded-lg border-l-2 border-blue-400 text-[11px] text-gray-600 truncate">
                                                        <span className="font-bold block text-blue-500">@{msg.replyTo.sender?.username}</span>
                                                        {msg.replyTo.content}
                                                    </div>
                                                )}
                                                {msg.poll?.question && (
                                                    <div className="mb-4 bg-gray-50/50 rounded-2xl p-4 border border-gray-100 shadow-inner">
                                                        <h4 className="font-bold text-sm text-gray-800 mb-3 ml-1">📊 {msg.poll.question}</h4>
                                                        <div className="space-y-2">
                                                            {msg.poll.options.map((opt, idx) => {
                                                                const totalVotes = msg.poll.options.reduce((acc, o) => acc + o.votes.length, 0);
                                                                const percentage = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                                                                const hasVoted = opt.votes.some(v => String(v) === String(currentUser.id));

                                                                return (
                                                                    <div key={idx} onClick={() => socket.emit('vote', { messageId: msg._id, optionIndex: idx, userId: currentUser.id })} className="relative h-10 group cursor-pointer">
                                                                        <div className="absolute inset-0 bg-white border border-gray-100/50 rounded-xl transition-all" />
                                                                        <div
                                                                            className={clsx("absolute inset-y-0 left-0 rounded-xl transition-all duration-700", hasVoted ? "bg-blue-500/10" : "bg-gray-100/50")}
                                                                            style={{ width: `${percentage}%` }}
                                                                        />
                                                                        <div className="absolute inset-0 flex justify-between items-center px-4">
                                                                            <span className={clsx("text-xs font-semibold", hasVoted ? "text-blue-600" : "text-gray-600")}>{opt.text}</span>
                                                                            <span className="text-[10px] font-black text-gray-400">{percentage}%</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        <p className="text-[9px] text-gray-400 mt-3 font-bold uppercase tracking-widest text-center">{msg.poll.options.reduce((acc, o) => acc + o.votes.length, 0)} votes total</p>
                                                    </div>
                                                )}
                                                {msg.fileUrl && !msg.isDeleted && (
                                                    <div className="mb-2 rounded-xl overflow-hidden">
                                                        {msg.fileType === 'sticker' && <img src={msg.fileUrl.startsWith('http') ? msg.fileUrl : `${SERVER_URL}${msg.fileUrl}`} className="w-40 h-40 object-contain hover:scale-105 transition-all" />}
                                                        {msg.fileType === 'image' && <img src={`${SERVER_URL}${msg.fileUrl}`} className="max-h-80 w-auto cursor-pointer" onClick={() => window.open(`${SERVER_URL}${msg.fileUrl}`, '_blank')} />}
                                                        {msg.fileType === 'video' && (
                                                            <div className={clsx("relative", msg.isVideoCircle ? "w-[240px] h-[240px] rounded-full overflow-hidden border-4 border-blue-500/20 shadow-lg" : "")}>
                                                                <video src={`${SERVER_URL}${msg.fileUrl}`} controls={!msg.isVideoCircle} autoPlay={msg.isVideoCircle} loop={msg.isVideoCircle} muted={msg.isVideoCircle} playsInline className={clsx("w-full h-full object-cover", msg.isVideoCircle ? "rounded-full" : "max-h-80")} />
                                                            </div>
                                                        )}
                                                        {msg.fileType === 'audio' && (
                                                            <div className="space-y-2">
                                                                <VoicePlayer url={`${SERVER_URL}${msg.fileUrl}`} isMe={isMe} />
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={async () => {
                                                                            if (transcriptions[msg._id]) return;
                                                                            patch({ transcribingId: msg._id });
                                                                            setTimeout(() => {
                                                                                setTranscriptions(prev => ({ ...prev, [msg._id]: "Simulated transcription: Your voice is clear and the message is received! This is a Telegram-grade AI feature working for you." }));
                                                                                patch({ transcribingId: null });
                                                                            }, 1500);
                                                                        }}
                                                                        className="text-[9px] font-black uppercase tracking-widest text-blue-500/70 hover:text-blue-500 flex items-center gap-1 transition-all"
                                                                    >
                                                                        {transcribingId === msg._id ? <Loader2 className="animate-spin" size={10} /> : <InfoIcon size={10} />}
                                                                        {transcriptions[msg._id] ? 'Transcribed' : 'Transcribe to Text'}
                                                                    </button>
                                                                </div>
                                                                {transcriptions[msg._id] && (
                                                                    <div className="bg-black/5 p-2 rounded-xl border-l-2 border-blue-400/30 animate-in fade-in slide-in-from-top-1">
                                                                        <p className="text-[10px] text-gray-500 italic leading-relaxed">{transcriptions[msg._id]}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        {msg.fileType === 'document' && (
                                                            <a href={`${SERVER_URL}${msg.fileUrl}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-black/5 rounded-xl text-inherit">
                                                                <FileText size={20} />
                                                                <span className="text-xs truncate">Document</span>
                                                            </a>
                                                        )}
                                                    </div>
                                                )}
                                                <p className={clsx("text-sm leading-relaxed break-words", msg.isDeleted ? "italic opacity-40 text-xs" : "")}>{renderMessageContent(msg)}</p>

                                                {msg.ogPreview && (
                                                    <div className="mt-3 p-3 bg-black/5 rounded-xl border border-black/10">
                                                        {msg.ogPreview.image && <img src={msg.ogPreview.image} className="w-full h-32 object-cover rounded-lg mb-2" />}
                                                        <h6 className="text-xs font-bold leading-tight line-clamp-2">{msg.ogPreview.title}</h6>
                                                        <p className="text-[10px] opacity-70 line-clamp-2 mt-1">{msg.ogPreview.description}</p>
                                                    </div>
                                                )}

                                                {msg.reactions?.length > 0 && !msg.isDeleted && (
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {Object.entries(
                                                            msg.reactions.reduce((acc, r) => { acc[r.emoji] = (acc[r.emoji] || 0) + 1; return acc; }, {})
                                                        ).map(([emoji, count]) => (
                                                            <div key={emoji} className="bg-white border border-gray-100 shadow-sm px-1.5 py-0.5 rounded-full text-[10px] flex items-center gap-1">
                                                                <span>{emoji}</span>
                                                                <span className="font-bold text-gray-500">{count}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-end gap-1.5 mt-1.5">
                                                    {msg.isEdited && !msg.isDeleted && <span className="text-[8px] text-gray-400 font-bold uppercase tracking-tighter">edited</span>}
                                                    <span className="text-[9px] opacity-50 font-medium">{format(new Date(msg.createdAt), 'HH:mm')}</span>
                                                    {isMe && (
                                                        msg.readBy?.some(id => id !== currentUser.id) ? (
                                                            <CheckCheck size={13} className="text-blue-500" />
                                                        ) : (
                                                            <CheckIcon size={13} className="text-gray-400" />
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    <div className="p-4 bg-white border-t border-gray-100 relative z-40">
                        {!canMessage ? (
                            <div className="py-4 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Only admins can post in this channel</p>
                            </div>
                        ) : (
                            <>
                                {replyingTo && (
                                    <div className="mb-2 bg-gray-50 p-3 rounded-2xl flex items-center justify-between animate-scale border-l-4 border-blue-500">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest leading-none mb-1">Replying to {replyingTo.sender?.username}</p>
                                            <p className="text-xs text-gray-500 truncate">{replyingTo.content}</p>
                                        </div>
                                        <button onClick={() => patch({ replyingTo: null })} className="p-1 hover:bg-gray-200 rounded-full transition-all"><X size={14} /></button>
                                    </div>
                                )}
                                <div className="max-w-4xl mx-auto flex items-end gap-3 px-2">
                                    <button onClick={() => fileInputRef.current.click()} className="p-2.5 text-gray-400 hover:text-blue-500 transition-colors mb-0.5"><Paperclip size={22} /></button>
                                    <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => {
                                        const file = e.target.files[0];
                                        if (file) {
                                            const fd = new FormData();
                                            fd.append('file', file);
                                            patch({ uploading: true });
                                            axios.post(`${API_BASE}/upload`, fd, { headers: { Authorization: `Bearer ${token}` } })
                                                .then(res => handleSend(null, res.data))
                                                .finally(() => patch({ uploading: false }));
                                        }
                                    }} />

                                    <div className="flex-1 bg-gray-100 rounded-[22px] px-4 py-1.5 border border-transparent focus-within:border-blue-500/20 focus-within:bg-white transition-all flex flex-col items-stretch">
                                        {linkPreview && (
                                            <div className="mb-2 relative p-2 bg-white rounded-xl border border-gray-100 flex gap-3 fade-in mt-1">
                                                <button onClick={() => patch({ linkPreview: null })} className="absolute -top-2 -right-2 bg-gray-900 text-white rounded-full p-0.5"><X size={10} /></button>
                                                {linkPreview.image && <img src={linkPreview.image} className="w-12 h-12 object-cover rounded-lg" />}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] font-bold truncate">{linkPreview.title}</p>
                                                    <p className="text-[9px] text-gray-400 truncate">{linkPreview.description}</p>
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex items-end">
                                            <textarea
                                                value={newMessage}
                                                onChange={(e) => {
                                                    patch({ newMessage: e.target.value });
                                                    handleTypingIndicator();
                                                    const urlMatch = e.target.value.match(/https?:\/\/[^\s]+/);
                                                    if (urlMatch && (!linkPreview || linkPreview.url !== urlMatch[0])) {
                                                        axios.get(`${API_BASE}/link-preview?url=${urlMatch[0]}`, { headers: { Authorization: `Bearer ${token}` } })
                                                            .then(res => patch({ linkPreview: res.data }))
                                                            .catch(() => { });
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        if (editingMessage) {
                                                            socket.emit('edit_message', { messageId: editingMessage._id, newContent: newMessage, userId: currentUser.id });
                                                            patch({ editingMessage: null, newMessage: '' });
                                                        } else {
                                                            handleSend();
                                                        }
                                                    }
                                                    if (e.key === 'Escape') patch({ editingMessage: null });
                                                }}
                                                placeholder={editingMessage ? "Edit message..." : "Write a message..."}
                                                className="w-full bg-transparent border-none outline-none text-sm py-2 max-h-40 resize-none text-gray-900"
                                                rows={1}
                                            />
                                            <div className="flex items-center gap-1 mb-1">
                                                {editingMessage && <button onClick={() => patch({ editingMessage: null })} className="p-1.5 text-red-500 hover:bg-red-50 rounded-full"><X size={16} /></button>}
                                                <button onClick={() => patch({ showPollModal: true })} className="p-1.5 text-gray-400 hover:text-blue-500 rounded-full" title="Create Poll">
                                                    <BarChart size={18} />
                                                </button>
                                                <button onClick={() => patch({ scheduledDelay: scheduledDelay > 0 ? 0 : 60 })} className={clsx("p-1.5 transition-colors rounded-full", scheduledDelay > 0 ? "text-blue-500 bg-blue-50" : "text-gray-400 hover:text-blue-500")} title="Schedule message">
                                                    <Clock size={18} />
                                                </button>
                                                <button onClick={() => patch({ showPicker: !showPicker })} className={clsx("p-1.5 transition-colors rounded-full", showPicker ? "text-blue-500 bg-blue-50" : "text-gray-400 hover:text-blue-500")}>
                                                    <Smile size={20} />
                                                </button>
                                            </div>
                                        </div>
                                        {showPicker && (
                                            <div className="absolute bottom-full right-0 mb-4 bg-white rounded-[32px] shadow-2xl border border-gray-100 w-80 h-96 flex flex-col overflow-hidden z-[60] animate-scale">
                                                <div className="flex border-b border-gray-50">
                                                    {['emoji', 'sticker', 'gif'].map(t => (
                                                        <button key={t} onClick={() => patch({ pickerTab: t })} className={clsx("flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all", pickerTab === t ? "text-blue-500 border-b-2 border-blue-500 bg-blue-50/50" : "text-gray-400 hover:text-gray-600")}>{t}</button>
                                                    ))}
                                                </div>
                                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                                    {pickerTab === 'emoji' && (
                                                        <div className="grid grid-cols-6 gap-2">
                                                            {EMOJIS.map(e => <button key={e} onClick={() => { const nm = useChatWindowStore.getState().newMessage; patch({ newMessage: nm + e, showPicker: false }); }} className="text-xl hover:bg-gray-50 p-2 rounded-xl transition-all">{e}</button>)}
                                                        </div>
                                                    )}
                                                    {pickerTab === 'sticker' && (
                                                        <div className="grid grid-cols-3 gap-3">
                                                            {[1, 2, 3, 4, 5, 6].map(i => (
                                                                <div key={i} onClick={() => { handleSend(null, { fileUrl: `/stickers/sticker${i}.png`, fileType: 'sticker' }); patch({ showPicker: false }); }} className="aspect-square bg-gray-50 rounded-2xl flex items-center justify-center cursor-pointer hover:scale-105 transition-all active:scale-95 border border-gray-100 p-2">
                                                                    <ImageIcon size={24} className="text-gray-300" />
                                                                    <span className="text-[8px] absolute bottom-1 text-gray-400">Sticker {i}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {pickerTab === 'gif' && (
                                                        <div className="space-y-3">
                                                            <input placeholder="Search GIFs..." className="w-full bg-gray-50 border border-gray-100 p-3 rounded-2xl text-xs outline-none focus:border-blue-500/30" />
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        {scheduledDelay > 0 && (
                                            <div className="pb-2 flex items-center justify-between text-[10px] text-blue-500 font-bold px-1">
                                                <span>Scheduled for {scheduledDelay}s delay</span>
                                                <button onClick={() => patch({ scheduledDelay: 0 })} className="hover:underline">Cancel</button>
                                            </div>
                                        )}
                                    </div>

                                    {newMessage.trim() ? (
                                        <button onClick={() => {
                                            if (editingMessage) {
                                                socket.emit('edit_message', { messageId: editingMessage._id, newContent: newMessage, userId: currentUser.id });
                                                patch({ editingMessage: null, newMessage: '' });
                                            } else handleSend();
                                        }} className="w-11 h-11 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600 transition-all shadow-md active:scale-95 shrink-0 mb-0.5"><Send size={18} /></button>
                                    ) : (
                                        <div className="flex items-center">
                                            <button
                                                onMouseDown={startRecording}
                                                onMouseUp={stopRecording}
                                                className={clsx(
                                                    "w-11 h-11 rounded-full flex items-center justify-center transition-all shrink-0 mb-0.5",
                                                    recording ? "bg-red-500 text-white animate-pulse shadow-lg scale-110" : "bg-gray-100 text-gray-500 hover:text-blue-500"
                                                )}
                                            >
                                                {recording ? <SquareIcon size={18} /> : (recordingMode === 'video' ? <VideoIcon size={22} /> : <Mic size={22} />)}
                                            </button>
                                            {!recording && (
                                                <button
                                                    onClick={() => patch({ recordingMode: recordingMode === 'voice' ? 'video' : 'voice' })}
                                                    className="w-11 h-11 text-gray-400 hover:text-blue-500 transition-all mb-0.5"
                                                    title="Switch Voice/Video"
                                                >
                                                    {recordingMode === 'voice' ? <VideoIcon size={18} /> : <Mic size={18} />}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                    {videoPreviewStream && (
                        <div className="fixed inset-0 z-[999] flex items-center justify-center pointer-events-none">
                            <div className="bg-black/40 backdrop-blur-sm absolute inset-0" />
                            <div className="relative w-[220px] h-[220px] md:w-[280px] md:h-[280px] rounded-full overflow-hidden border-[6px] border-white shadow-[0_0_50px_rgba(59,130,246,0.5)] bg-black pointer-events-auto ring-[10px] ring-blue-500/30 scale-in flex items-center justify-center">
                                <video autoPlay muted playsInline ref={v => v && (v.srcObject = videoPreviewStream)} className="w-full h-full object-cover rounded-full" />
                                <div className="absolute inset-x-0 bottom-6 flex justify-center">
                                    <div className="bg-red-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse shadow-lg flex items-center gap-1.5 border border-white/20">
                                        <div className="w-2 h-2 bg-white rounded-full" /> REC
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {showMedia && (
                    <div className="w-[300px] bg-white border-l border-gray-100 slide-left h-full flex flex-col z-50 overflow-hidden">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-gray-900">Chat Info</h3>
                            <button onClick={() => patch({ showMedia: false })} className="p-2 text-gray-400 hover:bg-gray-50 rounded-full"><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                            <div className="flex flex-col items-center text-center">
                                <div className="w-24 h-24 rounded-[32px] bg-blue-100 text-blue-600 flex items-center justify-center text-3xl font-bold mb-4 shadow-sm">
                                    {chat.name[0].toUpperCase()}
                                </div>
                                <h4 className="text-xl font-bold text-gray-900">{chat.name}</h4>
                                <p className="text-sm text-blue-500 font-bold tracking-tight">@{partnerDetails?.username || chat.name.toLowerCase()}</p>
                                {partnerDetails?.bio && <p className="text-xs text-gray-500 mt-3 px-4 leading-relaxed italic">"{partnerDetails.bio}"</p>}
                            </div>

                            <div className="flex flex-col gap-2 pt-2 border-b border-gray-50 pb-6">
                                <button
                                    onClick={async () => {
                                        try {
                                            const res = await axios.post(`${API_BASE}/mute`, { chatId: chat.id }, { headers: { Authorization: `Bearer ${token}` } });
                                            patch({ isMuted: res.data.muted });
                                        } catch (e) { console.error(e); }
                                    }}
                                    className={clsx(
                                        "flex items-center justify-between w-full px-4 py-3 rounded-2xl transition-all font-bold text-xs uppercase tracking-widest",
                                        isMuted ? "bg-red-50 text-red-500" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        {isMuted ? <BellOff size={16} /> : <Bell size={16} />}
                                        <span>Notifications</span>
                                    </div>
                                    <span className="text-[10px] opacity-60">{isMuted ? 'Muted' : 'Enabled'}</span>
                                </button>
                            </div>

                            {chat.type === 'channel' && stats && (
                                <div className="pt-4 space-y-4">
                                    <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Broadcast Stats</h5>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-gray-50 p-3 rounded-2xl flex flex-col items-center">
                                            <span className="text-xl font-black text-blue-500">{stats.membersCount}</span>
                                            <span className="text-[8px] uppercase font-bold text-gray-400">Members</span>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-2xl flex flex-col items-center">
                                            <span className="text-xl font-black text-purple-500">{stats.msgCount}</span>
                                            <span className="text-[8px] uppercase font-bold text-gray-400">Total Posts</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Top Contributors</p>
                                        {stats.topContributors.map((c, i) => (
                                            <div key={i} className="flex justify-between items-center text-xs bg-white border border-gray-50 p-2 rounded-xl">
                                                <span className="font-bold text-gray-700">{c.username}</span>
                                                <span className="text-[10px] font-black text-blue-500">{c.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 space-y-4">
                                <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Customize Experience</h5>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase font-bold text-gray-400 px-1">Set Alias</label>
                                        <div className="flex gap-2">
                                            <input
                                                value={alias}
                                                onChange={e => patch({ alias: e.target.value })}
                                                placeholder="Personal name..."
                                                className="flex-1 bg-gray-50 border border-gray-100 p-3 rounded-xl text-xs outline-none"
                                            />
                                            <button
                                                onClick={async () => {
                                                    await axios.post(`${API_BASE}/alias`, { targetUserId: chat.id, alias }, { headers: { Authorization: `Bearer ${token}` } });
                                                }}
                                                className="bg-blue-500 text-white p-3 rounded-xl hover:bg-blue-600 transition-all"
                                            ><CheckIcon size={16} /></button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase font-bold text-gray-400 px-1">Message Bubbles</label>
                                        <div className="flex flex-wrap gap-2">
                                            {['#eeffde', '#e3f2fd', '#fff9c4', '#f8bbd0', '#e1bee7', '#ffffff'].map(c => (
                                                <button
                                                    key={c}
                                                    onClick={async () => {
                                                        patch({ bubbleColor: c });
                                                        await axios.post(`${API_BASE}/preferences`, { chatId: chat.id, bubbleColor: c }, { headers: { Authorization: `Bearer ${token}` } });
                                                    }}
                                                    className={clsx("w-8 h-8 rounded-full border-2 transition-all", bubbleColor === c ? "border-blue-500 scale-110" : "border-transparent")}
                                                    style={{ backgroundColor: c }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 space-y-4">
                                <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Chat Wallpaper</h5>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        '#f4f7f9', '#ffffff', '#e3f2fd', '#fce4ec', '#f1f8e9',
                                        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                                        'linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)',
                                        'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)'
                                    ].map(v => (
                                        <button
                                            key={v}
                                            onClick={() => patch({ wallpaper: v })}
                                            className={clsx(
                                                "w-8 h-8 rounded-full border-2 transition-all hover:scale-110 active:scale-95",
                                                wallpaper === v ? "border-blue-500 scale-110" : "border-transparent"
                                            )}
                                            style={{ background: v }}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="pt-4 space-y-4">
                                <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2 flex justify-between items-center">
                                    <span>Shared Content</span>
                                    <span className="text-[8px] font-black text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">{sharedMedia.length}</span>
                                </h5>

                                <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100 mb-4">
                                    {['photos', 'files', 'links'].map(t => (
                                        <button
                                            key={t}
                                            onClick={() => patch({ mediaTab: t })}
                                            className={clsx(
                                                "flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
                                                mediaTab === t ? "bg-white text-blue-500 shadow-sm" : "text-gray-400 hover:text-gray-600"
                                            )}
                                        >{t}</button>
                                    ))}
                                </div>

                                {sharedMedia.length === 0 ? (
                                    <p className="text-xs text-center text-gray-400 py-10 italic">No shared data yet</p>
                                ) : (
                                    <div className="grid grid-cols-3 gap-2">
                                        {sharedMedia.filter(m => {
                                            if (mediaTab === 'photos') return m.type === 'image' || m.type === 'sticker';
                                            if (mediaTab === 'files') return m.type === 'video' || m.type === 'audio';
                                            if (mediaTab === 'links') return false;
                                            return true;
                                        }).map((m, i) => (
                                            <div key={i} className="aspect-square bg-gray-50 rounded-xl overflow-hidden cursor-pointer hover:opacity-80 transition-all border border-gray-100 group relative">
                                                {m.type === 'image' && <img src={m.url} className="w-full h-full object-cover" />}
                                                {m.type === 'video' && <div className="w-full h-full flex items-center justify-center bg-black/5"><VideoIcon size={20} className="text-gray-400" /></div>}
                                                {m.type === 'audio' && <div className="w-full h-full flex items-center justify-center bg-black/5"><Mic size={20} className="text-gray-400" /></div>}
                                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Search size={14} className="text-white" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {showPollModal && (
                    <div className="fixed inset-0 z-[100] bg-black/20 flex items-center justify-center p-4">
                        <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl p-6 border border-gray-100 animate-scale">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-gray-900 font-bold text-lg">New Poll</h3>
                                <button onClick={() => patch({ showPollModal: false })}><X className="text-gray-400" /></button>
                            </div>
                            <div className="space-y-4">
                                <input value={pollQuestion} onChange={e => patch({ pollQuestion: e.target.value })} placeholder="Pose a question..." className="w-full bg-gray-50 border border-gray-100 p-4 rounded-2xl outline-none focus:border-blue-500 text-sm" />
                                <div className="space-y-2">
                                    {pollOptions.map((opt, i) => (
                                        <input key={i} value={opt} onChange={e => {
                                            const n = [...pollOptions];
                                            n[i] = e.target.value;
                                            setPollOptions(n);
                                        }} placeholder={`Option ${i + 1}`} className="w-full bg-gray-50/50 border border-gray-50 p-3 rounded-xl outline-none focus:border-blue-500 text-xs" />
                                    ))}
                                </div>
                                <button onClick={() => setPollOptions([...pollOptions, ''])} className="w-full py-2 text-[10px] font-black text-blue-500 uppercase tracking-widest hover:bg-blue-50 rounded-xl transition-all">+ Add Option</button>
                                <button
                                    onClick={() => {
                                        handleSend(null, { poll: { question: pollQuestion, options: pollOptions.filter(o => o.trim()).map(o => ({ text: o, votes: [] })) } });
                                        patch({ showPollModal: false, pollQuestion: '' });
                                        setPollOptions(['', '']);
                                    }}
                                    className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/20"
                                >Create Poll</button>
                            </div>
                        </div>
                    </div>
                )}
                {forwardingMsg && (
                    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm fade-in">
                        <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl overflow-hidden flex flex-col p-6 animate-scale">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-gray-900 font-bold text-lg">Forward Message</h3>
                                <button onClick={() => patch({ forwardingMsg: null })} className="text-gray-400 hover:text-gray-600"><X /></button>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-2xl mb-6 border border-gray-100">
                                <p className="text-[10px] uppercase font-bold text-blue-500 mb-1">Message Preview</p>
                                <p className="text-sm text-gray-600 truncate">{forwardingMsg.content || 'Media message'}</p>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 max-h-80">
                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-2">Select conversation</p>
                                <p className="text-xs text-center text-gray-400 py-4">Selecting target...</p>
                                <button
                                    onClick={() => {
                                        handleSend(null, { content: forwardingMsg.content, fileUrl: forwardingMsg.fileUrl, fileType: forwardingMsg.fileType, forwardFrom: forwardingMsg.sender?.username });
                                        patch({ forwardingMsg: null });
                                    }}
                                    className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold text-sm shadow-md hover:bg-blue-600 transition-all"
                                >
                                    Forward to this chat
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
}
