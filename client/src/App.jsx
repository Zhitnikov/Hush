import React, { useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useShallow } from 'zustand/react/shallow';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import CallInterface from './components/CallInterface';
import SettingsModal from './components/SettingsModal';
import { generateKeyPair } from './utils/crypto';
import { Phone, Video as VideoIcon, X, Lock, ShieldCheck as ShieldCheckIcon } from 'lucide-react';
import axios from 'axios';
import { API_ORIGIN } from './config';
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
        setKeys,
        setSocket,
        setIncomingCall,
        setIsSyncing,
        setShowSettings,
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
            setKeys: s.setKeys,
            setSocket: s.setSocket,
            setIncomingCall: s.setIncomingCall,
            setIsSyncing: s.setIsSyncing,
            setShowSettings: s.setShowSettings,
            login: s.login,
            logout: s.logout,
            updateUser: s.updateUser,
        }))
    );

    const setSelectedChat = useAppStore((s) => s.setSelectedChat);
    const setActiveCall = useAppStore((s) => s.setActiveCall);
    const setUser = useAppStore((s) => s.setUser);

    const handleLogout = useCallback(() => {
        logout();
    }, [logout]);

    useEffect(() => {
        if (!token || !user) return;
        let isMounted = true;
        const syncIdentity = async () => {
            if (!isMounted) return;
            setIsSyncing(true);
            try {
                const res = await axios.get(`${API_ORIGIN}/api/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!res.data || !res.data._id) {
                    if (isMounted) handleLogout();
                    return;
                }
                let currentKeys = useAppStore.getState().keys;
                if (!currentKeys) {
                    currentKeys = await generateKeyPair();
                    if (isMounted) {
                        setKeys(currentKeys);
                        localStorage.setItem('chat_keys', JSON.stringify(currentKeys));
                    }
                }
                await axios.post(`${API_ORIGIN}/api/auth/update-key`,
                    { publicKey: currentKeys.publicKey },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (isMounted) {
                    const fullUser = { ...res.data, id: res.data._id, publicKey: currentKeys.publicKey };
                    setUser(fullUser);
                    localStorage.setItem('user', JSON.stringify(fullUser));
                }
            } catch (err) {
                if (err.response && [401, 404].includes(err.response.status)) {
                    if (isMounted) handleLogout();
                }
            } finally {
                if (isMounted) setIsSyncing(false);
            }
        };
        syncIdentity();
        return () => { isMounted = false; };
    }, [token, handleLogout, setIsSyncing, setKeys, setUser]);

    useEffect(() => {
        if (token && user?.id) {
            const newSocket = io(API_ORIGIN);
            setSocket(newSocket);
            newSocket.on('connect', () => {
                newSocket.emit('join_user', user.id);
                if (window.activeChatId && window.activeChatType === 'channel') {
                    newSocket.emit('join_room', window.activeChatId);
                }
            });
            newSocket.on('incoming_call', ({ from, offer, name, type }) => {
                setIncomingCall({ targetId: from, offer, name, type, isReceiver: true });
            });
            return () => newSocket.close();
        }
    }, [token, user?.id, setSocket, setIncomingCall]);

    if (!token || !user || !user.id) {
        return <Auth onLogin={login} />;
    }

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-white font-sans text-gray-900">
            <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-[320px] lg:w-[380px] h-full z-20 border-r border-gray-100 shrink-0`}>
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

            <div className={`${selectedChat ? 'flex' : 'hidden md:flex'} flex-1 h-full relative bg-gray-50`}>
                {selectedChat ? (
                    <ChatWindow
                        chat={selectedChat}
                        token={token}
                        currentUser={user}
                        myKeys={keys}
                        socket={socket}
                        onBack={() => setSelectedChat(null)}
                        onStartCall={(type) => setActiveCall({ targetId: selectedChat.id, name: selectedChat.name, type, isReceiver: false })}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-10">
                        <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mb-6">
                            <ShieldCheckIcon className="text-blue-500" size={40} />
                        </div>
                        <h2 className="text-gray-900 font-bold text-xl mb-2">Select a chat to start messaging</h2>
                        <p className="text-gray-500 text-sm max-w-xs text-center">
                            Your messages are end-to-end encrypted and completely private.
                        </p>
                    </div>
                )}
            </div>

            {activeCall && <CallInterface callData={activeCall} socket={socket} currentUser={user} onEnd={() => setActiveCall(null)} />}

            {incomingCall && !activeCall && (
                <div className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 fade-in">
                    <div className="bg-white p-10 rounded-[40px] shadow-2xl flex flex-col items-center space-y-8 w-full max-w-sm">
                        <div className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center shadow-lg">
                            <span className="text-4xl font-bold text-white uppercase">{incomingCall.name?.[0]}</span>
                        </div>
                        <div className="text-center">
                            <h3 className="text-gray-900 font-bold text-2xl">{incomingCall.name}</h3>
                            <p className="text-blue-500 text-xs font-bold uppercase tracking-widest mt-2">Incoming Call</p>
                        </div>
                        <div className="flex gap-4 w-full">
                            <button onClick={() => setIncomingCall(null)} className="flex-1 bg-gray-100 text-gray-900 p-5 rounded-3xl hover:bg-gray-200 transition-all flex items-center justify-center font-bold">Decline</button>
                            <button onClick={() => { setActiveCall(incomingCall); setIncomingCall(null); }} className="flex-1 bg-green-500 text-white p-5 rounded-3xl hover:bg-green-600 shadow-lg transition-all flex items-center justify-center">
                                {incomingCall.type === 'video' ? <VideoIcon size={28} /> : <Phone size={28} />}
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
        </div>
    );
}

export default App;
