import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import axios from 'axios';
import { useChatWindowStore, useChatWindowSelectors } from '../stores/chatWindowStore';
import { ArrowLeft, Send, Phone, Video as VideoIcon, Paperclip, Smile, Mic, Shield, Clock, X, Search, Edit3, Trash2, Forward, ImageIcon, Bookmark, BarChart, Bell, BellOff, Pin, PinOff, Reply, Check as CheckIcon, Info as InfoIcon, Loader2, CheckCheck, FileText, MoreVertical } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import clsx from 'clsx';
import { encryptMessage, decryptMessage, decryptGroupKey } from '../utils/crypto';
import { renderMarkdown, isProbablyMarkdown } from '../utils/markdown';
import VoicePlayer from './VoicePlayer';
import VideoCirclePlayer from './VideoCirclePlayer';
import { createMediaRecorder, recordingUploadFile } from '../utils/mediaRecorder';
import ChatSkeleton from './ChatSkeleton';
import { API_BASE, API_ORIGIN } from '../config';
import api from '../utils/apiClient';
import { requestUserMedia, getMediaUnavailableReason } from '../utils/mediaDevices';
import { useAppStore } from '../stores/appStore';
import { enrichMessage, replyPreviewText } from '../utils/messageText';
import { loadAppearance } from '../utils/appearance';
import { messagePreviewLabel } from '../utils/messagePreview';
import { getLocalMedia, localMediaIdForMessage, metaKey, previewKey } from '../utils/localMediaStore';
import { sendChatAttachment, decryptMediaBuffer, migrateServerMediaToLocal } from '../utils/mediaTransfer';

const SERVER_URL = API_ORIGIN || (typeof window !== 'undefined' ? window.location.origin : '');
const PAGE_SIZE = 30;
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
    const messagesLoadIdRef = useRef(0);
    const headerMenuRef = useRef(null);
    const [showHeaderMenu, setShowHeaderMenu] = useState(false);
    const [searchResults, setSearchResults] = useState(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [forwardTargets, setForwardTargets] = useState([]);
    const [forwardLoading, setForwardLoading] = useState(false);
    const [forwardSearch, setForwardSearch] = useState('');
    const [localMediaUrls, setLocalMediaUrls] = useState({});

    const fileInputRef = useRef(null);
    const scrollRef = useRef(null);
    const pendingScrollBottomRef = useRef(true);
    const audioChunksRef = useRef([]);
    const recordingDiscardRef = useRef(false);
    const recordingStreamRef = useRef(null);

    const keysStatus = useAppStore((s) => s.keysStatus);
    const myPubKey = myKeys?.publicKey || currentUser?.publicKey;
    const myPrivKey = myKeys?.privateKey;
    const keysReady = keysStatus === 'ready' && Boolean(myPrivKey);

    const processIncomingMessage = useCallback(async (msg) => {
        if (!myPrivKey) return { ...msg, content: msg.content ?? '', pendingDecrypt: true };
        return enrichMessage(msg, myPrivKey, groupKey, myPubKey);
    }, [myPrivKey, groupKey, myPubKey]);

    useEffect(() => {
        if (!showHeaderMenu) return;
        const close = (e) => {
            if (headerMenuRef.current && !headerMenuRef.current.contains(e.target)) {
                setShowHeaderMenu(false);
            }
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [showHeaderMenu]);

    useEffect(() => {
        if (!socket) return;
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
            const processed = await processIncomingMessage(msg);
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
        const handleRead = ({ chatId, readerId }) => {
            const reader = readerId || chatId;
            if (chat.type === 'user') {
                setMessages(prev => prev.map(m => {
                    const sid = (m.sender?._id || m.sender)?.toString();
                    if (sid !== currentUser.id) return m;
                    const rb = [...(m.readBy || []).map((x) => x?.toString?.() || x)];
                    if (!rb.includes(String(reader))) rb.push(reader);
                    return { ...m, readBy: rb };
                }));
            } else if (reader && chat.type === 'channel') {
                setMessages(prev => prev.map(m => {
                    const rb = [...(m.readBy || []).map((x) => x?.toString?.() || x)];
                    if (!rb.includes(String(reader))) rb.push(reader);
                    return { ...m, readBy: rb };
                }));
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
            const processed = await processIncomingMessage(msg);
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

        socket.emit('mark_read', { chatType: chat.type, chatId: chat.id });
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
    }, [chat.id, chat.type, socket, processIncomingMessage, currentUser.id]);

    useEffect(() => {
        if (!myPrivKey || messages.length === 0) return;
        let cancelled = false;
        (async () => {
            const next = await Promise.all(messages.map(async (m) => {
                if (!m.pendingDecrypt && !String(m.content || '').trim().startsWith('{')) return m;
                return enrichMessage(m, myPrivKey, groupKey, myPubKey);
            }));
            if (!cancelled) setMessages(next);
        })();
        return () => { cancelled = true; };
    }, [myPrivKey, myPubKey, groupKey]);

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
        const loadId = ++messagesLoadIdRef.current;
        let cancelled = false;
        resetForChatSwitch(chat, currentUser);

        const finishLoading = () => {
            if (!cancelled && messagesLoadIdRef.current === loadId) {
                patch({ loadingInitial: false });
            }
        };

        (async () => {
            let gKey = null;
            try {
                if (chat.type === 'channel') {
                    const cRes = await axios.get(`${API_BASE}/channels`, { headers: { Authorization: `Bearer ${token}` } });
                    const channelList = Array.isArray(cRes.data) ? cRes.data : [];
                    const current = channelList.find(c => String(c._id) === String(chat.id));
                    if (current) patch({ partnerDetails: current });
                    const myEntry = current?.encryptedKeys?.find(k => String(k.userId) === String(currentUser.id));
                    if (myEntry && myPrivKey) {
                        try {
                            gKey = await decryptGroupKey(myEntry.key, myPrivKey);
                        } catch (e) {
                            console.error('Group key decrypt failed', e);
                        }
                    }
                    patch({ groupKey: gKey });
                } else {
                    patch({ groupKey: null });
                    if (String(chat.id) !== String(currentUser.id)) {
                        try {
                            const res = await api.get(`/api/auth/user/${chat.id}`);
                            if (!cancelled && messagesLoadIdRef.current === loadId) patch({ partnerDetails: res.data });
                        } catch (e) {
                            if (e.response?.status !== 429) console.error(e);
                        }
                    }
                }

                const endpoint = chat.type === 'channel' ? `/messages/channel/${chat.id}` : `/messages/private/${chat.id}`;
                const res = await axios.get(`${API_BASE}${endpoint}`, {
                    params: { limit: PAGE_SIZE },
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (cancelled || messagesLoadIdRef.current !== loadId) return;
                const list = Array.isArray(res.data.messages) ? res.data.messages : (Array.isArray(res.data) ? res.data : []);
                const decrypted = await Promise.all(list.map(async (m) => {
                    if (!myPrivKey) return { ...m, content: m.content ?? '', pendingDecrypt: true };
                    return enrichMessage(m, myPrivKey, chat.type === 'channel' ? gKey : null, myPubKey);
                }));
                if (cancelled || messagesLoadIdRef.current !== loadId) return;
                setMessages(decrypted);
                patch({ hasMoreOlder: res.data.hasMore !== false && list.length === PAGE_SIZE });
            } catch (e) {
                console.error('Failed to load messages', e);
                if (!cancelled && messagesLoadIdRef.current === loadId) setMessages([]);
            } finally {
                finishLoading();
            }
        })();

        return () => { cancelled = true; };
    }, [chat.id, chat.type, token, myPrivKey, myPubKey, currentUser?.id]);

    useEffect(() => {
        pendingScrollBottomRef.current = true;
    }, [chat.id]);

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
            const scrollEl = scrollRef.current;
            const prevScrollHeight = scrollEl?.scrollHeight || 0;
            const prevTop = scrollEl?.scrollTop || 0;
            const decrypted = await Promise.all(raw.map((m) => enrichMessage(m, myPrivKey, groupKey, myPubKey)));
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

    const handleEdit = async () => {
        if (!editingMessage || !newMessage.trim()) return;
        let content = newMessage;
        try {
            if (chat.type === 'user' && chat.publicKey) {
                content = await encryptMessage(newMessage, chat.publicKey, null, myPubKey);
            } else if (chat.type === 'channel' && groupKey) {
                content = await encryptMessage(newMessage, null, groupKey, myPubKey);
            }
        } catch (err) {
            console.error(err);
            return;
        }
        socket.emit('edit_message', { messageId: editingMessage._id, newContent: content });
        patch({ editingMessage: null, newMessage: '' });
    };

    const handleSend = async (e, fileData = null) => {
        if (e) e.preventDefault();
        const contentToSend = fileData?.content || newMessage;
        if (!contentToSend.trim() && !fileData) return;
        if (!keysReady) {
            if (keysStatus === 'needs-secure-context') {
                alert('Откройте приложение по HTTPS (порт 3443) — см. красный баннер сверху.');
            } else {
                alert('Ключи ещё загружаются. Подождите секунду.');
            }
            return;
        }

        let content = contentToSend;
        if (contentToSend.trim()) {
            if (chat.type === 'user' && chat.publicKey) {
                content = await encryptMessage(contentToSend, chat.publicKey, null, myPubKey);
            } else if (chat.type === 'channel' && groupKey) {
                content = await encryptMessage(contentToSend, null, groupKey, myPubKey);
            }
        }
        socket.emit('send_message', {
            receiverId: chat.type === 'user' ? chat.id : null,
            content: (fileData?.isAudio || fileData?.fileType === 'video') ? (fileData?.isAudio ? 'Voice Message' : 'Video Message') : content,
            isChannel: chat.type === 'channel', channelId: chat.type === 'channel' ? chat.id : null,
            fileUrl: fileData?.fileUrl || null, fileType: fileData?.isAudio ? 'audio' : (fileData?.fileType || null),
            replyTo: replyingTo?._id || null,
            forwardFrom: fileData?.forwardFrom || null,
            scheduledAt: scheduledDelay > 0 ? new Date(Date.now() + scheduledDelay * 1000) : null,
            ogPreview: linkPreview,
            isVideoCircle: Boolean(fileData?.isVideoCircle),
            poll: fileData?.poll || null
        });
        patch({ newMessage: '', replyingTo: null, linkPreview: null, scheduledDelay: 0 });
    };

    const cleanupRecordingStream = () => {
        recordingStreamRef.current?.getTracks().forEach((t) => t.stop());
        recordingStreamRef.current = null;
        patch({ mediaRecorder: null, recording: false, videoPreviewStream: null });
    };

    const startRecording = async () => {
        if (recording) return;
        try {
            recordingDiscardRef.current = false;
            const stream = await requestUserMedia({
                audio: true,
                video: recordingMode === 'video' ? { width: 480, height: 480, frameRate: 24, facingMode: 'user' } : false,
            });
            recordingStreamRef.current = stream;
            if (recordingMode === 'video') patch({ videoPreviewStream: stream });

            audioChunksRef.current = [];
            const recorder = createMediaRecorder(stream, recordingMode === 'video');

            recorder.ondataavailable = (e) => {
                if (e.data?.size > 0) audioChunksRef.current.push(e.data);
            };

            recorder.onstop = async () => {
                const discard = recordingDiscardRef.current;
                const mode = recordingMode;
                const mime = recorder.mimeType || (mode === 'video' ? 'video/webm' : 'audio/webm');
                const chunks = [...audioChunksRef.current];
                audioChunksRef.current = [];
                cleanupRecordingStream();

                if (discard || chunks.length === 0) return;

                const { mime: uploadMime } = recordingUploadFile(mode, mime);
                const blob = new Blob(chunks, { type: uploadMime });
                patch({ uploading: true });
                try {
                    await sendAttachment(blob, mode === 'video' ? 'video' : 'audio', {
                        isAudio: mode === 'voice',
                        isVideoCircle: mode === 'video',
                    });
                } catch (err) {
                    const msg = err.message || 'Не удалось отправить запись';
                    console.error('Recording send failed', err);
                    alert(msg);
                } finally {
                    patch({ uploading: false });
                }
            };

            recorder.start(250);
            patch({ mediaRecorder: recorder, recording: true });
        } catch (e) {
            console.error('Recording error:', e);
            cleanupRecordingStream();
            alert(e.message || getMediaUnavailableReason());
        }
    };

    const cancelRecording = () => {
        recordingDiscardRef.current = true;
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        } else {
            cleanupRecordingStream();
        }
    };

    const sendRecording = () => {
        recordingDiscardRef.current = false;
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            try {
                mediaRecorder.requestData();
            } catch {  }
            mediaRecorder.stop();
        }
    };

    const getStatusText = () => {
        if (chat.type === 'channel') {
            return partnerDetails?.type === 'broadcast' ? 'канал' : 'группа';
        }
        if (typingUser) return null;
        if (userStatus.status === 'online') return 'в сети';
        if (!userStatus.lastSeen) return 'не в сети';
        try {
            return formatDistanceToNow(new Date(userStatus.lastSeen), { addSuffix: true, locale: ru });
        } catch {
            return 'не в сети';
        }
    };

    const messagesForList = useMemo(() => {
        if (showSearch && localSearchQuery.trim() && searchResults) return searchResults;
        return messages;
    }, [messages, showSearch, localSearchQuery, searchResults]);

    useEffect(() => {
        if (!showSearch || !localSearchQuery.trim()) {
            setSearchResults(null);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            setSearchLoading(true);
            try {
                const res = await axios.get(`${API_BASE}/messages/search`, {
                    params: { chatId: chat.id, chatType: chat.type, query: localSearchQuery.trim() },
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (cancelled) return;
                const list = Array.isArray(res.data) ? res.data : [];
                const decrypted = await Promise.all(
                    list.map((m) => enrichMessage(m, myPrivKey, groupKey, myPubKey))
                );
                if (!cancelled) setSearchResults(decrypted.reverse());
            } catch (e) {
                console.error('search', e);
                if (!cancelled) setSearchResults([]);
            } finally {
                if (!cancelled) setSearchLoading(false);
            }
        }, 350);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [showSearch, localSearchQuery, chat.id, chat.type, token, myPrivKey, groupKey, myPubKey]);

    useEffect(() => {
        if (!forwardingMsg) {
            setForwardTargets([]);
            return;
        }
        let cancelled = false;
        setForwardLoading(true);
        (async () => {
            try {
                const [uRes, cRes] = await Promise.all([
                    axios.get(`${API_BASE}/users`, { headers: { Authorization: `Bearer ${token}` } }),
                    axios.get(`${API_BASE}/channels`, { headers: { Authorization: `Bearer ${token}` } }),
                ]);
                if (cancelled) return;
                const users = (Array.isArray(uRes.data) ? uRes.data : [])
                    .map((u) => ({
                        type: 'user',
                        id: String(u._id),
                        name: u.username,
                        publicKey: u.publicKey,
                        lastMessageAt: u.lastMessageAt,
                    }))
                    .filter((t) => t.id !== String(currentUser.id));
                const channels = (Array.isArray(cRes.data) ? cRes.data : [])
                    .map((c) => ({
                        type: 'channel',
                        id: String(c._id),
                        name: c.name,
                        lastMessageAt: c.lastMessageAt,
                    }))
                    .filter((t) => !(chat.type === 'channel' && t.id === String(chat.id)));
                const filtered = [...users, ...channels].filter((t) => {
                    if (chat.type === 'user' && t.type === 'user' && t.id === String(chat.id)) return false;
                    return true;
                });
                setForwardTargets(filtered);
            } catch (e) {
                console.error('forward targets', e);
            } finally {
                if (!cancelled) setForwardLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [forwardingMsg, token, chat.id, chat.type, currentUser?.id]);

    useEffect(() => {
        const onAppearance = () => {
            const app = loadAppearance();
            patch({ wallpaper: app.chatBackground, bubbleColor: app.bubbleMe });
        };
        window.addEventListener('hush-appearance', onAppearance);
        return () => window.removeEventListener('hush-appearance', onAppearance);
    }, [patch]);

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
        messagesForList.forEach(m => {
            const date = format(new Date(m.createdAt), 'yyyy-MM-dd');
            if (!groups[date]) groups[date] = [];
            groups[date].push(m);
        });
        return groups;
    }, [messagesForList]);

    const scrollChatToBottom = useCallback((force = false) => {
        if (!force && !pendingScrollBottomRef.current) return;
        const el = scrollRef.current;
        if (!el) return;

        const run = () => {
            el.scrollTop = el.scrollHeight;
        };

        run();
        requestAnimationFrame(() => {
            run();
            requestAnimationFrame(() => {
                run();
                pendingScrollBottomRef.current = false;
            });
        });
    }, []);

    useEffect(() => {
        if (loadingInitial || messagesForList.length === 0) return;
        scrollChatToBottom(true);
    }, [loadingInitial, chat.id, messagesForList.length, scrollChatToBottom]);

    useEffect(() => {
        if (!messages.length) return;
        const el = scrollRef.current;
        const nearBottom = el && el.scrollHeight - el.scrollTop - el.clientHeight < 160;
        if (nearBottom || pendingScrollBottomRef.current) {
            scrollChatToBottom();
        }
    }, [messages.length, scrollChatToBottom]);

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
        patch({
            isMuted: currentUser?.mutedChats?.includes(chat.id),
            alias: currentUser?.aliases?.[chat.id] || '',
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
        if (isProbablyMarkdown(msg.content) && !msg.isEncrypted) {
            return (
                <div
                    className="markdown-body text-sm leading-relaxed break-words"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
            );
        }
        const tokens = msg.content.split(/(\s+)/);
        return tokens.map((token, i) => {
            if (token.startsWith('@')) return <span key={i} className="text-[var(--accent)] font-medium">{token}</span>;
            if (token.startsWith('#')) return <span key={i} className="text-violet-600 font-medium">{token}</span>;
            if (token.match(/https?:\/\/[^\s]+/)) return <a key={i} href={token} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline break-all">{token}</a>;
            return token;
        });
    };

    const handleAddReaction = (messageId, emoji) => {
        socket.emit('add_reaction', { messageId, emoji });
        patch({ bloomReaction: { id: messageId, emoji } });
        setTimeout(() => patch({ bloomReaction: null }), 1000);
        patch({ reactionsMsgId: null });
    };

    const isBroadcast = chat.type === 'channel' && partnerDetails?.type === 'broadcast';
    const canMessage = !isBroadcast || String(partnerDetails?.creator) === String(currentUser.id);

    const getMediaCryptoContext = useCallback(() => ({
        recipientPublicKey: chat.type === 'user' ? chat.publicKey : null,
        groupKeyB64: chat.type === 'channel' ? groupKey : null,
        senderPublicKey: myPubKey,
    }), [chat.type, chat.publicKey, groupKey, myPubKey]);

    const sendAttachment = useCallback(async (file, fileType, extras = {}) => {
        if (!socket || !keysReady) {
            alert('Ключи ещё загружаются');
            return;
        }
        const peerOnline = chat.type === 'channel' || userStatus.status === 'online';
        const payload = await sendChatAttachment({
            socket,
            chatType: chat.type,
            chatId: chat.id,
            file,
            fileType,
            cryptoContext: getMediaCryptoContext(),
            peerOnline,
        });
        await handleSend(null, { ...payload, ...extras });
    }, [socket, keysReady, chat.type, chat.id, userStatus.status, getMediaCryptoContext]);

    const refreshLocalMediaUrls = useCallback(async () => {
        if (!myPrivKey) return;
        const next = {};
        for (const m of messages) {
            if (!m.fileUrl) continue;
            if (m.fileUrl.startsWith('local://')) {
                const id = m.fileUrl.slice(8);
                const preview = await getLocalMedia(previewKey(id));
                if (preview) {
                    next[id] = URL.createObjectURL(preview);
                    continue;
                }
                const enc = await getLocalMedia(id);
                const metaBlob = await getLocalMedia(metaKey(id));
                if (!enc || !metaBlob) continue;
                try {
                    const meta = JSON.parse(await metaBlob.text());
                    const gk = meta.isGroup ? groupKey : null;
                    const dec = await decryptMediaBuffer(await enc.arrayBuffer(), meta, myPrivKey, gk, myPubKey);
                    next[id] = URL.createObjectURL(new Blob([dec], { type: meta.mime || 'application/octet-stream' }));
                } catch {
                    
                }
            } else if (m.fileUrl.startsWith('/uploads/')) {
                const blob = await migrateServerMediaToLocal(m._id, `${SERVER_URL}${m.fileUrl}`);
                if (blob) next[localMediaIdForMessage(m._id)] = URL.createObjectURL(blob);
            }
        }
        setLocalMediaUrls((prev) => ({ ...prev, ...next }));
    }, [messages, myPrivKey, groupKey, myPubKey]);

    useEffect(() => {
        refreshLocalMediaUrls();
        const onReady = () => refreshLocalMediaUrls();
        window.addEventListener('hush-media-ready', onReady);
        return () => window.removeEventListener('hush-media-ready', onReady);
    }, [refreshLocalMediaUrls]);

    const onScrollMessages = useCallback(() => {
        const el = scrollRef.current;
        if (!el || loadingOlder || !hasMoreOlder || (showSearch && localSearchQuery.trim())) return;
        if (el.scrollTop < 140) loadOlderRef.current();
    }, [loadingOlder, hasMoreOlder, showSearch, localSearchQuery]);

    const sortedForwardTargets = useMemo(() => {
        const q = forwardSearch.trim().toLowerCase();
        let list = [...forwardTargets];
        if (q) list = list.filter((t) => t.name?.toLowerCase().includes(q));
        list.sort((a, b) => {
            const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return tb - ta;
        });
        return list;
    }, [forwardTargets, forwardSearch]);

    const resolveMediaSrc = useCallback((msg) => {
        if (!msg?.fileUrl) return null;
        if (msg.fileUrl.startsWith('local://')) {
            const id = msg.fileUrl.slice(8);
            return localMediaUrls[id] || localMediaUrls[localMediaIdForMessage(msg._id)] || null;
        }
        if (msg.fileUrl.startsWith('http')) return msg.fileUrl;
        return `${SERVER_URL}${msg.fileUrl}`;
    }, [localMediaUrls]);

    const forwardToTarget = async (target) => {
        const msg = forwardingMsg;
        if (!msg || !socket || !keysReady) return;
        let plain = (msg.content || '').trim();
        if (plain.startsWith('{') && plain.includes('e2ee')) {
            plain = replyPreviewText(msg) || messagePreviewLabel(msg) || '';
        }
        if (!plain && msg.fileUrl) {
            plain = msg.fileType === 'audio' ? 'Voice Message' : msg.fileType === 'video' ? 'Video Message' : 'Media';
        }
        try {
            let pubKey = target.publicKey;
            if (target.type === 'user' && !pubKey) {
                const res = await api.get(`/api/auth/user/${target.id}`);
                pubKey = res.data?.publicKey;
            }

            let content = plain || ' ';
            if (target.type === 'user' && pubKey) {
                content = await encryptMessage(plain || 'Forwarded', pubKey, null, myPubKey);
            } else if (target.type === 'channel') {
                const cRes = await axios.get(`${API_BASE}/channels`, { headers: { Authorization: `Bearer ${token}` } });
                const ch = (Array.isArray(cRes.data) ? cRes.data : []).find((c) => String(c._id) === target.id);
                const entry = ch?.encryptedKeys?.find((k) => String(k.userId) === String(currentUser.id));
                if (!entry || !myPrivKey) throw new Error('no channel key');
                const gk = await decryptGroupKey(entry.key, myPrivKey);
                content = await encryptMessage(plain || 'Forwarded', null, gk, myPubKey);
            }

            let fileUrl = msg.fileUrl || null;
            let fileType = msg.fileType || null;
            if (fileUrl?.startsWith('local://')) {
                const id = fileUrl.slice(8);
                const preview = await getLocalMedia(previewKey(id));
                if (preview) {
                    const fwd = await sendChatAttachment({
                        socket,
                        chatType: target.type,
                        chatId: target.id,
                        file: preview,
                        fileType: msg.fileType || 'document',
                        cryptoContext: target.type === 'user'
                            ? { recipientPublicKey: pubKey, groupKeyB64: null, senderPublicKey: myPubKey }
                            : {
                                recipientPublicKey: null,
                                groupKeyB64: (await (async () => {
                                    const cRes = await axios.get(`${API_BASE}/channels`, { headers: { Authorization: `Bearer ${token}` } });
                                    const ch = (Array.isArray(cRes.data) ? cRes.data : []).find((c) => String(c._id) === target.id);
                                    const entry = ch?.encryptedKeys?.find((k) => String(k.userId) === String(currentUser.id));
                                    if (!entry || !myPrivKey) return null;
                                    return decryptGroupKey(entry.key, myPrivKey);
                                })()),
                                senderPublicKey: myPubKey,
                            },
                        peerOnline: true,
                    });
                    fileUrl = fwd.fileUrl;
                    fileType = fwd.fileType;
                }
            }

            socket.emit('send_message', {
                receiverId: target.type === 'user' ? target.id : null,
                isChannel: target.type === 'channel',
                channelId: target.type === 'channel' ? target.id : null,
                content,
                fileUrl,
                fileType,
                forwardFrom: msg.sender?.username || currentUser.username,
            });
            patch({ forwardingMsg: null, forwardSearch: '' });
        } catch (e) {
            console.error(e);
            alert('Не удалось переслать сообщение');
        }
    };

    const renderMessageRow = (msg) => {
        const isMe = String(msg.sender?._id || msg.sender) === String(currentUser?.id);
        const isRead = msg.readBy?.some((id) => String(id) !== String(currentUser.id));
        const replyText = replyPreviewText(msg);
        const mediaSrc = resolveMediaSrc(msg);
        return (
            <div key={msg._id} className={clsx('flex flex-col group fade-in relative max-w-full w-full', isMe ? 'items-end' : 'items-start')}>
                <div
                    className={clsx(
                        'max-w-[85%] md:max-w-[70%] p-3 relative transition-shadow overflow-hidden',
                        isMe ? 'msg-bubble-me text-gray-900' : 'msg-bubble-other text-gray-900'
                    )}
                    style={isMe ? { backgroundColor: 'var(--bg-bubble-me)' } : { backgroundColor: 'var(--bg-bubble-other)' }}
                >
                    {bloomReaction?.id === msg._id && (
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-50 text-2xl reaction-bloom">
                            {bloomReaction.emoji}
                        </div>
                    )}

                    <div className={clsx(
                        'msg-actions absolute top-0 opacity-0 group-hover:opacity-100 max-lg:hidden transition-all flex gap-1 z-20',
                        isMe ? 'right-full mr-1' : 'left-full ml-1'
                    )}>
                        <button onClick={() => patch({ reactionsMsgId: reactionsMsgId === msg._id ? null : msg._id })} className="p-2 text-gray-400 hover:text-blue-500 bg-white rounded-full shadow-sm border border-gray-100"><Smile size={14} /></button>
                        <button
                            onClick={() => patch({ replyingTo: msg })}
                            className="p-2 text-gray-400 hover:text-blue-500 bg-white rounded-full shadow-sm border border-gray-100"
                            title="Reply"
                        >
                            <Reply size={14} />
                        </button>
                        <button onClick={() => patch({ forwardingMsg: msg })} className="p-2 text-gray-400 hover:text-blue-500 bg-white rounded-full shadow-sm border border-gray-100"><Forward size={14} /></button>
                        {isMe && !msg.isDeleted && (
                            <>
                                <button onClick={() => { patch({ editingMessage: msg, newMessage: msg.content }); }} className="p-2 text-gray-400 hover:text-green-500 bg-white rounded-full shadow-sm border border-gray-100"><Edit3 size={14} /></button>
                                <button onClick={() => socket.emit('delete_message', { messageId: msg._id, forEveryone: true })} className="p-2 text-gray-400 hover:text-red-500 bg-white rounded-full shadow-sm border border-gray-100" title="Удалить для всех"><Trash2 size={14} /></button>
                            </>
                        )}
                        {chat.type === 'channel' && String(partnerDetails?.creator) === String(currentUser.id) && (
                            <button
                                onClick={async () => {
                                    await axios.post(`${API_BASE}/pin`, { channelId: chat.id, messageId: msg._id }, { headers: { Authorization: `Bearer ${token}` } });
                                }}
                                className="p-2 text-gray-400 hover:text-blue-500 bg-white rounded-full shadow-sm border border-gray-100"
                                title="Pin Message"
                            ><Pin size={14} /></button>
                        )}

                        {reactionsMsgId === msg._id && (
                            <div className={clsx(
                                'absolute bottom-10 bg-white border border-gray-100 shadow-xl rounded-full p-1.5 flex gap-1 z-50 fade-in',
                                isMe ? 'left-0' : 'right-0'
                            )}>
                                {EMOJIS.map(e => (
                                    <button key={e} onClick={() => { handleAddReaction(msg._id, e); }} className="text-lg hover:scale-125 transition-transform">{e}</button>
                                ))}
                            </div>
                        )}
                    </div>

                    {msg.replyTo && (
                        <div className="mb-2 bg-black/5 p-2 rounded-lg border-l-2 border-blue-400 text-[11px] text-gray-600 truncate">
                            <span className="font-bold block text-blue-500">@{msg.replyTo.sender?.username || 'user'}</span>
                            {replyText}
                        </div>
                    )}
                    {msg.poll?.question && Array.isArray(msg.poll?.options) && msg.poll.options.some((o) => o?.text) && (
                        <div className="mb-4 bg-gray-50/50 rounded-2xl p-4 border border-gray-100 shadow-inner">
                            <h4 className="font-bold text-sm text-gray-800 mb-3 ml-1">📊 {msg.poll.question}</h4>
                            <div className="space-y-2">
                                {msg.poll.options.map((opt, idx) => {
                                    const totalVotes = msg.poll.options.reduce((acc, o) => acc + o.votes.length, 0);
                                    const percentage = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                                    const hasVoted = opt.votes.some(v => String(v) === String(currentUser.id));

                                    return (
                                        <div key={idx} onClick={() => socket.emit('vote', { messageId: msg._id, optionIndex: idx })} className="relative h-10 group cursor-pointer">
                                            <div className="absolute inset-0 bg-white border border-gray-100/50 rounded-xl transition-all" />
                                            <div
                                                className={clsx('absolute inset-y-0 left-0 rounded-xl transition-all duration-700', hasVoted ? 'bg-blue-500/10' : 'bg-gray-100/50')}
                                                style={{ width: `${percentage}%` }}
                                            />
                                            <div className="absolute inset-0 flex justify-between items-center px-4">
                                                <span className={clsx('text-xs font-semibold', hasVoted ? 'text-blue-600' : 'text-gray-600')}>{opt.text}</span>
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
                            {msg.fileType === 'sticker' && mediaSrc && <img src={mediaSrc} className="w-32 h-32 object-contain" alt="" />}
                            {msg.fileType === 'image' && mediaSrc && <img src={mediaSrc} className="max-h-80 w-auto max-w-full cursor-pointer" alt="" onClick={() => window.open(mediaSrc, '_blank')} />}
                            {msg.fileType === 'video' && mediaSrc && (
                                msg.isVideoCircle ? (
                                    <VideoCirclePlayer src={mediaSrc} />
                                ) : (
                                    <video src={mediaSrc} controls playsInline className="max-h-80 w-full max-w-full rounded-xl" />
                                )
                            )}
                            {msg.fileType === 'audio' && mediaSrc && (
                                <div className="space-y-2">
                                    <VoicePlayer url={mediaSrc} isMe={isMe} />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (transcriptions[msg._id]) return;
                                            patch({ transcribingId: msg._id });
                                            setTimeout(() => {
                                                setTranscriptions((prev) => ({ ...prev, [msg._id]: 'Расшифровка: голосовое сообщение получено.' }));
                                                patch({ transcribingId: null });
                                            }, 1500);
                                        }}
                                        className="text-[9px] font-black uppercase tracking-widest text-blue-500/70 hover:text-blue-500 flex items-center gap-1"
                                    >
                                        {transcribingId === msg._id ? <Loader2 className="animate-spin" size={10} /> : <InfoIcon size={10} />}
                                        {transcriptions[msg._id] ? 'Готово' : 'В текст'}
                                    </button>
                                    {transcriptions[msg._id] && (
                                        <p className="text-[10px] text-gray-500 italic">{transcriptions[msg._id]}</p>
                                    )}
                                </div>
                            )}
                            {msg.fileType === 'document' && mediaSrc && (
                                <a href={mediaSrc} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-black/5 rounded-xl text-inherit">
                                    <FileText size={20} />
                                    <span className="text-xs truncate">Document</span>
                                </a>
                            )}
                        </div>
                    )}
                    <p className={clsx('text-sm leading-relaxed break-words', msg.isDeleted ? 'italic opacity-40 text-xs' : '')}>{renderMessageContent(msg)}</p>

                    {msg.ogPreview && (
                        <div className="mt-3 p-3 bg-black/5 rounded-xl border border-black/10">
                            {msg.ogPreview.image && <img src={msg.ogPreview.image} className="w-full h-32 object-cover rounded-lg mb-2" alt="" />}
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
                            isRead ? (
                                <CheckCheck size={13} className="text-[var(--accent)]" />
                            ) : (
                                <CheckIcon size={13} className="text-gray-400" />
                            )
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full hush-chat-panel relative w-full overflow-hidden max-w-full">
            <div className="hush-chat-header z-40 shrink-0">
                <button type="button" onClick={onBack} className="lg:hidden hush-btn-icon -ml-2"><ArrowLeft size={20} /></button>
                <div className="flex items-center flex-1 min-w-0 cursor-pointer" onClick={() => patch({ showMedia: true })}>
                    <div className="w-10 h-10 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-semibold shrink-0">
                        {chat.name[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 ml-3">
                        <div className="flex items-center gap-2">
                            <h2 className="font-semibold text-[15px] truncate">{alias || chat.name}</h2>
                            {chat.type === 'channel' && (
                                <span className={clsx(
                                    "text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md tracking-tighter",
                                    partnerDetails?.type === 'broadcast' ? "bg-amber-100 text-amber-600" : "bg-purple-100 text-purple-600"
                                )}>
                                    {partnerDetails?.type === 'broadcast' ? 'Broadcast' : 'Group'}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 min-w-0">
                            {typingUser ? (
                                <p className="text-[11px] font-bold text-blue-500 animate-pulse truncate">{chat.type === 'channel' ? `${typingUser} печатает…` : 'печатает…'}</p>
                            ) : (
                                <p className={clsx(
                                    "text-[11px] font-medium truncate max-w-full",
                                    userStatus.status === 'online' ? "text-blue-500" : "text-gray-400"
                                )}>
                                    {getStatusText()}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
                <div className="hidden lg:flex gap-0.5 items-center shrink-0">
                    {chat.type === 'user' && (
                        <>
                            <button type="button" onClick={() => onStartCall('audio')} className="hush-btn-icon"><Phone size={20} /></button>
                            <button type="button" onClick={() => onStartCall('video')} className="hush-btn-icon"><VideoIcon size={20} /></button>
                        </>
                    )}
                    <button type="button" onClick={() => patch({ showSearch: !showSearch })} className={clsx('hush-btn-icon', showSearch && '!text-[var(--accent)] !bg-[var(--accent-muted)]')}><Search size={20} /></button>
                    <button type="button" onClick={() => patch({ showMedia: !showMedia })} className={clsx('hush-btn-icon', showMedia && '!text-[var(--accent)] !bg-[var(--accent-muted)]')}><InfoIcon size={20} /></button>
                </div>
                <div className="relative lg:hidden shrink-0" ref={headerMenuRef}>
                    <button
                        type="button"
                        className="hush-btn-icon"
                        aria-expanded={showHeaderMenu}
                        onClick={(e) => { e.stopPropagation(); setShowHeaderMenu((v) => !v); }}
                    >
                        <MoreVertical size={20} />
                    </button>
                    {showHeaderMenu && (
                        <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] bg-white rounded-xl shadow-lg border border-[var(--border)] py-1">
                            {chat.type === 'user' && (
                                <>
                                    <button type="button" onClick={() => { setShowHeaderMenu(false); onStartCall('audio'); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--bg-hover)] flex items-center gap-3">
                                        <Phone size={18} /> Аудиозвонок
                                    </button>
                                    <button type="button" onClick={() => { setShowHeaderMenu(false); onStartCall('video'); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--bg-hover)] flex items-center gap-3">
                                        <VideoIcon size={18} /> Видеозвонок
                                    </button>
                                </>
                            )}
                            <button type="button" onClick={() => { setShowHeaderMenu(false); patch({ showSearch: !showSearch }); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--bg-hover)] flex items-center gap-3">
                                <Search size={18} /> Поиск
                            </button>
                            <button type="button" onClick={() => { setShowHeaderMenu(false); patch({ showMedia: !showMedia }); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--bg-hover)] flex items-center gap-3">
                                <InfoIcon size={18} /> Информация
                            </button>
                        </div>
                    )}
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
                        className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 custom-scrollbar relative transition-all duration-500 max-w-full"
                        style={{ background: 'var(--bg-chat)', backgroundImage: 'var(--bg-chat-pattern)' }}
                    >
                        {loadingInitial && <ChatSkeleton />}

                        {!loadingInitial && keysStatus === 'loading' && (
                            <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                                <Loader2 className="animate-spin text-[var(--accent)] mb-2" size={24} />
                                <p className="text-xs text-[var(--text-secondary)]">Ключи…</p>
                            </div>
                        )}
                        {showSearch && localSearchQuery.trim() && searchLoading && (
                            <div className="flex justify-center py-6">
                                <Loader2 className="animate-spin text-blue-500" size={22} />
                            </div>
                        )}

                        {!loadingInitial && keysStatus !== 'loading' && messagesForList.length === 0 && !searchLoading && (
                            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                                <Shield size={28} className="text-[var(--accent)] mb-3 opacity-70" />
                                <p className="text-sm font-medium text-[var(--text-primary)]">Сообщений пока нет</p>
                                <p className="text-xs text-[var(--text-secondary)] mt-1 opacity-80">Напишите первое сообщение</p>
                            </div>
                        )}

                        {loadingOlder && (
                            <div className="flex justify-center py-3">
                                <Loader2 className="animate-spin text-blue-500" size={22} />
                            </div>
                        )}

                        <div className="flex flex-col gap-4 w-full max-w-full min-w-0">
                            {!loadingInitial && Object.keys(groupedMessages).map((date) => (
                                <div key={date} className="flex flex-col gap-4">
                                    <div className="flex justify-center shrink-0">
                                        <span className="bg-gray-200/50 text-gray-500 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                                            {getDateLabel(date)}
                                        </span>
                                    </div>
                                    {groupedMessages[date].map((msg) => renderMessageRow(msg))}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="hush-compose relative z-40">
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
                                            <p className="text-xs text-gray-500 truncate">{replyPreviewText(replyingTo)}</p>
                                        </div>
                                        <button onClick={() => patch({ replyingTo: null })} className="p-1 hover:bg-gray-200 rounded-full transition-all"><X size={14} /></button>
                                    </div>
                                )}
                                <div className="max-w-3xl mx-auto flex items-end gap-2">
                                    <button type="button" onClick={() => fileInputRef.current.click()} className="hush-btn-icon shrink-0"><Paperclip size={20} /></button>
                                    <input type="file" ref={fileInputRef} className="hidden" onChange={async (e) => {
                                        const file = e.target.files[0];
                                        if (!file) return;
                                        e.target.value = '';
                                        patch({ uploading: true });
                                        try {
                                            let fileType = 'document';
                                            if (file.type.startsWith('image/')) fileType = 'image';
                                            else if (file.type.startsWith('video/')) fileType = 'video';
                                            else if (file.type.startsWith('audio/')) fileType = 'audio';
                                            await sendAttachment(file, fileType);
                                        } catch (err) {
                                            console.error(err);
                                            alert(err.message || 'Не удалось отправить файл');
                                        } finally {
                                            patch({ uploading: false });
                                        }
                                    }} />

                                    <div className="flex-1 hush-compose-field flex-col items-stretch">
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
                                                            handleEdit();
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
                                                        <div className="grid grid-cols-6 gap-2">
                                                            {['🎉', '🔥', '❤️', '😂', '👍', '🙏', '✨', '🎈', '💯', '🤝', '😍', '🥳'].map((emoji) => (
                                                                <button
                                                                    key={emoji}
                                                                    type="button"
                                                                    onClick={() => { patch({ newMessage: emoji, showPicker: false }); handleSend(); }}
                                                                    className="text-2xl p-2 rounded-xl hover:bg-gray-50 active:scale-95"
                                                                >
                                                                    {emoji}
                                                                </button>
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
                                            if (editingMessage) handleEdit();
                                            else handleSend();
                                        }} className="hush-btn-send shrink-0"><Send size={18} /></button>
                                    ) : (
                                        <div className="flex items-center gap-1">
                                            {!recording && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={startRecording}
                                                        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 mb-0.5 bg-gray-100 text-gray-500 hover:text-blue-500"
                                                        title={recordingMode === 'video' ? 'Видеокружок' : 'Голосовое'}
                                                    >
                                                        {recordingMode === 'video' ? <VideoIcon size={22} /> : <Mic size={22} />}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => patch({ recordingMode: recordingMode === 'voice' ? 'video' : 'voice' })}
                                                        className="w-9 h-11 text-gray-400 hover:text-blue-500 transition-all mb-0.5"
                                                        title="Голос / кружок"
                                                    >
                                                        {recordingMode === 'voice' ? <VideoIcon size={18} /> : <Mic size={18} />}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                    {recording && (
                        <div className="fixed inset-0 z-[998] flex flex-col items-center justify-center">
                            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                            {videoPreviewStream ? (
                                <div className="relative z-10 w-[220px] h-[220px] md:w-[280px] md:h-[280px] rounded-full overflow-hidden border-[6px] border-white shadow-xl ring-4 ring-blue-500/40">
                                    <video autoPlay muted playsInline ref={(v) => { if (v) v.srcObject = videoPreviewStream; }} className="w-full h-full object-cover scale-x-[-1]" />
                                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500 text-white px-3 py-1 rounded-full text-[10px] font-bold animate-pulse">
                                        REC
                                    </div>
                                </div>
                            ) : (
                                <div className="relative z-10 flex flex-col items-center gap-4">
                                    <div className="w-24 h-24 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
                                        <Mic size={40} className="text-red-500" />
                                    </div>
                                    <p className="text-white text-sm font-medium">Запись голосового…</p>
                                </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-center gap-10 px-6 pb-[calc(1.5rem+var(--safe-bottom))] pt-4">
                                <button type="button" onClick={cancelRecording} className="flex flex-col items-center gap-2 text-white">
                                    <span className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
                                        <Trash2 size={24} />
                                    </span>
                                    <span className="text-xs font-medium">Удалить</span>
                                </button>
                                <button type="button" onClick={sendRecording} className="flex flex-col items-center gap-2 text-white">
                                    <span className="w-14 h-14 rounded-full bg-blue-500 flex items-center justify-center shadow-lg">
                                        <Send size={22} />
                                    </span>
                                    <span className="text-xs font-medium">Отправить</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {showMedia && (
                    <>
                        <div
                            className="lg:hidden fixed inset-0 z-[85] bg-black/40"
                            onClick={() => patch({ showMedia: false })}
                            aria-hidden
                        />
                        <div className={clsx(
                            'bg-white flex flex-col overflow-hidden z-[90]',
                            'fixed inset-0 lg:relative lg:inset-auto lg:w-[300px] lg:border-l lg:border-gray-100 lg:h-full slide-left max-w-[100vw]'
                        )}>
                        <div className="p-4 md:p-6 border-b border-gray-100 flex items-center gap-2 shrink-0 safe-top">
                            <button
                                type="button"
                                onClick={() => patch({ showMedia: false })}
                                className="lg:hidden hush-btn-icon -ml-1"
                                aria-label="Назад"
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <h3 className="font-bold text-gray-900 flex-1">Информация</h3>
                            <button type="button" onClick={() => patch({ showMedia: false })} className="hidden lg:block p-2 text-gray-400 hover:bg-gray-50 rounded-full"><X size={20} /></button>
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
                    </>
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
                        <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl overflow-hidden flex flex-col p-6 animate-scale max-h-[85dvh]">
                            <div className="flex justify-between items-center mb-4 shrink-0">
                                <h3 className="text-gray-900 font-bold text-lg">Переслать</h3>
                                <button type="button" onClick={() => patch({ forwardingMsg: null })} className="text-gray-400 hover:text-gray-600"><X /></button>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-2xl mb-4 border border-gray-100 shrink-0">
                                <p className="text-[10px] uppercase font-bold text-blue-500 mb-1">Сообщение</p>
                                <p className="text-sm text-gray-600 truncate">{replyPreviewText(forwardingMsg) || messagePreviewLabel(forwardingMsg) || 'Медиа'}</p>
                            </div>
                            <input
                                type="search"
                                value={forwardSearch}
                                onChange={(e) => setForwardSearch(e.target.value)}
                                placeholder="Поиск чата…"
                                className="w-full mb-3 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 text-sm outline-none focus:border-blue-400 shrink-0"
                            />
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-2 shrink-0">Выберите чат</p>
                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5 min-h-0">
                                {forwardLoading && (
                                    <div className="flex justify-center py-8">
                                        <Loader2 className="animate-spin text-blue-500" size={24} />
                                    </div>
                                )}
                                {!forwardLoading && sortedForwardTargets.length === 0 && (
                                    <p className="text-xs text-center text-gray-400 py-6">Нет доступных чатов</p>
                                )}
                                {!forwardLoading && sortedForwardTargets.map((t) => (
                                    <button
                                        key={`${t.type}-${t.id}`}
                                        type="button"
                                        onClick={() => forwardToTarget(t)}
                                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-semibold shrink-0 text-sm">
                                            {t.name?.[0]?.toUpperCase() || '?'}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium text-[13px] truncate">{t.name}</p>
                                            <p className="text-[9px] text-gray-400">{t.type === 'channel' ? 'Группа' : 'Личный'}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
}
