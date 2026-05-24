import React, { useEffect, useCallback, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useShallow } from 'zustand/react/shallow';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import CallInterface from './components/CallInterface';
import SettingsModal from './components/SettingsModal';
import NetworkBanner from './components/NetworkBanner';
import SecureContextBanner from './components/SecureContextBanner';
import SessionBanner from './components/SessionBanner';
import { loadAppearance } from './utils/appearance';
import { ensureUserKeys } from './utils/keysBootstrap';
import { SecureCryptoRequiredError } from './utils/cryptoEnvironment';
import api from './utils/apiClient';
import { handleMediaTransferStart, handleMediaTransferChunk, clearMediaSessions } from './utils/mediaReceive';
import { processOutgoingMediaQueue } from './utils/mediaQueue';
import { getSocketUrl } from './config';
import { getLocaltunnelHeaders, isLocaltunnelHost } from './utils/localtunnel';
import { useAppStore } from './stores/appStore';

function App() {
    const {
        token,
        user,
        keys,
        socket,
        selectedChat,
        activeCall,
        incomingCall,
        isSyncing,
        showSettings,
        activeChatId,
        activeChatType,
        setKeys,
        setKeysStatus,
        keysStatus,
        setSocket,
        setIncomingCall,
        setIsSyncing,
        setShowSettings,
        setActiveChat,
        login,
        logout,
        updateUser,
    } = useAppStore(
        useShallow((s) => ({
            token: s.token,
            user: s.user,
            keys: s.keys,
            socket: s.socket,
            selectedChat: s.selectedChat,
            activeCall: s.activeCall,
            incomingCall: s.incomingCall,
            isSyncing: s.isSyncing,
            showSettings: s.showSettings,
            activeChatId: s.activeChatId,
            activeChatType: s.activeChatType,
            setKeys: s.setKeys,
            setKeysStatus: s.setKeysStatus,
            keysStatus: s.keysStatus,
            setSocket: s.setSocket,
            setIncomingCall: s.setIncomingCall,
            setIsSyncing: s.setIsSyncing,
            setShowSettings: s.setShowSettings,
            setActiveChat: s.setActiveChat,
            login: s.login,
            logout: s.logout,
            updateUser: s.updateUser,
        }))
    );

    const setSelectedChat = useAppStore((s) => s.setSelectedChat);
    const setActiveCall = useAppStore((s) => s.setActiveCall);
    const setUser = useAppStore((s) => s.setUser);
    const socketRef = useRef(null);
    const identitySyncedRef = useRef(false);
    const [sessionReady, setSessionReady] = useState(() => !useAppStore.getState().token);

    const handleLogout = useCallback(() => {
        identitySyncedRef.current = false;
        logout();
    }, [logout]);

    useEffect(() => {
        identitySyncedRef.current = false;
    }, [token]);

    useEffect(() => {
        if (!token) {
            setSessionReady(true);
            return;
        }
        let cancelled = false;
        setSessionReady(false);
        api.get('/api/auth/me')
            .catch((err) => {
                if (!cancelled && err.response?.status === 401) {
                    useAppStore.getState().showSessionExpired();
                }
            })
            .finally(() => {
                if (!cancelled) setSessionReady(true);
            });
        return () => { cancelled = true; };
    }, [token]);

    useEffect(() => {
        if (!user?.id) return;
        let cancelled = false;
        setKeysStatus('loading');
        (async () => {
            try {
                const { keys: k, error } = await ensureUserKeys(user.id);
                if (cancelled) return;
                if (k) setKeys(k);
                if (error instanceof SecureCryptoRequiredError) {
                    setKeysStatus('needs-secure-context');
                } else if (k?.privateKey) {
                    setKeysStatus('ready');
                } else {
                    setKeysStatus('error');
                }
            } catch (e) {
                if (!cancelled) {
                    console.error('keys bootstrap', e);
                    setKeysStatus('error');
                }
            }
        })();
        return () => { cancelled = true; };
    }, [user?.id, setKeys, setKeysStatus]);

    useEffect(() => {
        if (!token || !user?.id || identitySyncedRef.current) return;
        let isMounted = true;
        identitySyncedRef.current = true;

        const syncIdentity = async () => {
            setIsSyncing(true);
            try {
                const res = await api.get('/api/auth/me');
                if (!res.data?._id) {
                    if (isMounted) handleLogout();
                    return;
                }
                let currentKeys = useAppStore.getState().keys;
                if (!currentKeys?.privateKey) {
                    const { keys: k, error } = await ensureUserKeys(user.id);
                    currentKeys = k;
                    if (isMounted) {
                        if (k) setKeys(k);
                        if (error instanceof SecureCryptoRequiredError) {
                            setKeysStatus('needs-secure-context');
                        } else if (k?.privateKey) {
                            setKeysStatus('ready');
                        }
                    }
                }
                const storedKey = currentKeys?.publicKey;
                const serverKey = res.data.publicKey;
                if (storedKey && storedKey !== serverKey) {
                    await api.post('/api/auth/update-key', { publicKey: storedKey });
                }
                if (isMounted) {
                    const fullUser = { ...res.data, id: res.data._id, publicKey: storedKey || serverKey };
                    setUser(fullUser);
                    localStorage.setItem('user', JSON.stringify(fullUser));
                }
            } catch (err) {
                if (err.response?.status === 429) {
                    identitySyncedRef.current = false;
                } else if (err.response?.status === 404 && isMounted) {
                    handleLogout();
                }
            } finally {
                if (isMounted) setIsSyncing(false);
            }
        };
        syncIdentity();
        return () => { isMounted = false; };
    }, [token, user?.id, handleLogout, setIsSyncing, setKeys, setKeysStatus, setUser]);

    useEffect(() => {
        if (!token || !user?.id) return;

            const lt = typeof window !== 'undefined' && isLocaltunnelHost();
            const newSocket = io(getSocketUrl(), {
            auth: { token },

            transports: lt ? ['polling'] : ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: 10,
            extraHeaders: getLocaltunnelHeaders(),
        });
        socketRef.current = newSocket;
        setSocket(newSocket);

        const onConnect = () => {
            newSocket.emit('join_user');
            if (activeChatId && activeChatType === 'channel') {
                newSocket.emit('join_room', activeChatId);
            }
            processOutgoingMediaQueue(newSocket).catch((e) => console.warn('media queue', e));
        };

        newSocket.on('connect', onConnect);
        const onIncomingCall = ({ from, offer, name, type }) => {
            setIncomingCall({ targetId: String(from), offer, name, type, isReceiver: true });
        };
        const onCallEnded = () => {
            setIncomingCall(null);
            setActiveCall(null);
        };

        newSocket.on('incoming_call', onIncomingCall);
        newSocket.on('call_ended', onCallEnded);

        const onMediaStart = (payload) => handleMediaTransferStart(payload);
        const onMediaChunk = (payload) => handleMediaTransferChunk(payload);
        const onPeerOnline = ({ status }) => {
            if (status === 'online') {
                processOutgoingMediaQueue(newSocket).catch((e) => console.warn('media queue', e));
            }
        };

        newSocket.on('media_transfer_start', onMediaStart);
        newSocket.on('media_transfer_chunk', onMediaChunk);
        newSocket.on('user_status_change', onPeerOnline);

        return () => {
            newSocket.off('connect', onConnect);
            newSocket.off('incoming_call', onIncomingCall);
            newSocket.off('call_ended', onCallEnded);
            newSocket.off('media_transfer_start', onMediaStart);
            newSocket.off('media_transfer_chunk', onMediaChunk);
            newSocket.off('user_status_change', onPeerOnline);
            clearMediaSessions();
            newSocket.close();
            socketRef.current = null;
        };
    }, [token, user?.id, setSocket, setIncomingCall, activeChatId, activeChatType]);

    useEffect(() => {
        if (selectedChat) {
            setActiveChat(selectedChat.id, selectedChat.type);
            if (socketRef.current && selectedChat.type === 'channel') {
                socketRef.current.emit('join_room', selectedChat.id);
            }
        }
    }, [selectedChat?.id, selectedChat?.type, setActiveChat]);

    if (!token || !user || !user.id) {
        return (
            <>
                <SessionBanner />
                <Auth onLogin={login} />
            </>
        );
    }

    if (!sessionReady) {
        return (
            <>
                <SessionBanner />
                <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)] text-[var(--text-muted)] text-sm">
                    Проверка сессии…
                </div>
            </>
        );
    }

    return (
        <div className="flex hush-app-shell w-full max-w-[100vw] min-w-0 overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">
            <NetworkBanner />
            <SessionBanner />
            <SecureContextBanner />
            <div className={`${selectedChat ? 'hidden lg:flex' : 'flex'} w-full min-w-0 lg:max-w-[var(--sidebar-w)] lg:w-[var(--sidebar-w)] h-full z-20 shrink-0`}>
                <Sidebar
                    token={token}
                    onSelectChat={setSelectedChat}
                    selectedChat={selectedChat}
                    onLogout={handleLogout}
                    currentUser={user}
                    socket={socket}
                    onOpenSettings={() => setShowSettings(true)}
                />
            </div>

            <div
                className={`${selectedChat ? 'flex' : 'hidden lg:flex'} flex-1 min-w-0 h-full relative`}
                style={{ background: loadAppearance().chatBackground, backgroundImage: 'var(--bg-chat-pattern)' }}
            >
                {selectedChat ? (
                    <ChatWindow
                        chat={selectedChat}
                        token={token}
                        currentUser={user}
                        myKeys={keys}
                        socket={socket}
                        onBack={() => setSelectedChat(null)}
                        onStartCall={(type) => {
                            if (!socket?.connected) {
                                alert('Нет связи с сервером. Дождитесь подключения или обновите страницу.');
                                return;
                            }
                            setActiveCall({
                                targetId: String(selectedChat.id),
                                name: selectedChat.name,
                                type,
                                isReceiver: false,
                            });
                        }}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 select-none">
                        <div className="w-[72px] h-[72px] rounded-[18px] bg-[var(--accent-muted)] flex items-center justify-center mb-5 border border-[var(--border)]">
                            <span className="text-2xl font-semibold text-[var(--accent)]">H</span>
                        </div>
                        <h2 className="text-[var(--text-primary)] font-semibold text-lg mb-1">Выберите чат</h2>
                        <p className="text-[var(--text-muted)] text-sm max-w-[260px] text-center leading-relaxed">
                            Личные сообщения шифруются на устройстве. Ключи хранятся в IndexedDB.
                        </p>
                    </div>
                )}
            </div>

            {activeCall && (
                <CallInterface
                    callData={activeCall}
                    socket={socket}
                    currentUser={user}
                    onEnd={() => setActiveCall(null)}
                />
            )}

            {incomingCall && !activeCall && (
                <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-6">
                    <div className="bg-[var(--bg-sidebar)] p-8 rounded-2xl shadow-xl flex flex-col items-center gap-6 w-full max-w-sm border border-[var(--border)]">
                        <div className="w-20 h-20 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-3xl font-semibold uppercase">
                            {incomingCall.name?.[0]}
                        </div>
                        <div className="text-center">
                            <h3 className="font-semibold text-lg">{incomingCall.name}</h3>
                            <p className="text-[var(--text-muted)] text-xs mt-1 uppercase tracking-wide">Входящий звонок</p>
                        </div>
                        <div className="flex gap-3 w-full">
                            <button type="button" onClick={() => setIncomingCall(null)} className="flex-1 py-3 rounded-xl bg-[var(--bg-input)] font-medium hover:opacity-90">
                                Отклонить
                            </button>
                            <button
                                type="button"
                                onClick={() => { setActiveCall(incomingCall); setIncomingCall(null); }}
                                className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700"
                            >
                                Принять
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showSettings && (
                <SettingsModal
                    user={user}
                    token={token}
                    onClose={() => setShowSettings(false)}
                    onUpdateUser={updateUser}
                />
            )}

            {isSyncing && (
                <div className="fixed bottom-3 right-3 text-[10px] text-[var(--text-muted)] bg-[var(--bg-sidebar)] px-2 py-1 rounded border border-[var(--border)]">
                    Синхронизация…
                </div>
            )}
        </div>
    );
}

export default App;
