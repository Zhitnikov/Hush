import { create } from 'zustand';

function readUser() {
    try {
        const raw = localStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function readKeys() {
    try {
        const raw = localStorage.getItem('chat_keys');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export const useAppStore = create((set, get) => ({
    token: typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null,
    user: typeof localStorage !== 'undefined' ? readUser() : null,
    keys: typeof localStorage !== 'undefined' ? readKeys() : null,
    socket: null,
    selectedChat: null,
    activeCall: null,
    incomingCall: null,
    isSyncing: false,
    showSettings: false,

    setToken: (token) => set({ token }),
    setUser: (user) => set({ user }),
    setKeys: (keys) => set({ keys }),
    setSocket: (socket) => set({ socket }),
    setSelectedChat: (selectedChat) => set({ selectedChat }),
    setActiveCall: (activeCall) => set({ activeCall }),
    setIncomingCall: (incomingCall) => set({ incomingCall }),
    setIsSyncing: (isSyncing) => set({ isSyncing }),
    setShowSettings: (showSettings) => set({ showSettings }),

    login: (userData, tokenData) => {
        const user = { ...userData, id: userData.id || userData._id };
        localStorage.setItem('token', tokenData);
        localStorage.setItem('user', JSON.stringify(user));
        set({ token: tokenData, user });
    },

    logout: () => {
        const { socket } = get();
        localStorage.clear();
        if (socket) socket.close();
        set({
            token: null,
            user: null,
            keys: null,
            socket: null,
            selectedChat: null,
            activeCall: null,
            incomingCall: null,
            showSettings: false,
            isSyncing: false
        });
    },

    updateUser: (updated) => {
        const userWithId = { ...updated, id: updated._id || updated.id };
        localStorage.setItem('user', JSON.stringify(userWithId));
        set({ user: userWithId });
    }
}));
