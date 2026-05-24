import { create } from 'zustand';

let sessionExpiryHandled = false;

export function resetSessionExpiryGuard() {
    sessionExpiryHandled = false;
}

export function claimSessionExpiry() {
    if (sessionExpiryHandled) return false;
    sessionExpiryHandled = true;
    return true;
}

function readUser() {
    try {
        const raw = localStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export const useAppStore = create((set, get) => ({
    token: typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null,
    refreshToken: typeof localStorage !== 'undefined' ? localStorage.getItem('refreshToken') : null,
    user: typeof localStorage !== 'undefined' ? readUser() : null,
    keys: null,
    keysStatus: 'idle',
    socket: null,
    selectedChat: null,
    activeCall: null,
    incomingCall: null,
    isSyncing: false,
    showSettings: false,
    activeChatId: null,
    activeChatType: null,
    sessionNotice: null,

    setToken: (token) => set({ token }),
    setUser: (user) => set({ user }),
    setKeys: (keys) => set({ keys }),
    setKeysStatus: (keysStatus) => set({ keysStatus }),
    setSocket: (socket) => set({ socket }),
    setSelectedChat: (selectedChat) => set({ selectedChat }),
    setActiveCall: (activeCall) => set({ activeCall }),
    setIncomingCall: (incomingCall) => set({ incomingCall }),
    setIsSyncing: (isSyncing) => set({ isSyncing }),
    setShowSettings: (showSettings) => set({ showSettings }),
    setActiveChat: (id, type) => set({ activeChatId: id, activeChatType: type }),

    login: (userData, tokenData, refreshToken) => {
        resetSessionExpiryGuard();
        const user = { ...userData, id: userData.id || userData._id };
        localStorage.setItem('token', tokenData);
        if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(user));
        set({ token: tokenData, refreshToken: refreshToken || null, user });
    },

    showSessionExpired: (message) => {
        const text = message || 'Войдите снова, чтобы продолжить.';
        const { socket } = get();
        if (socket) socket.close();
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        set({
            token: null,
            refreshToken: null,
            user: null,
            keys: null,
            keysStatus: 'idle',
            socket: null,
            selectedChat: null,
            activeCall: null,
            incomingCall: null,
            showSettings: false,
            isSyncing: false,
            activeChatId: null,
            activeChatType: null,
            sessionNotice: text,
        });
    },

    clearSessionNotice: () => set({ sessionNotice: null }),

    logout: () => {
        resetSessionExpiryGuard();
        const { socket, user } = get();
        const uid = user?.id;
        const drafts = uid ? localStorage.getItem(`drafts_${uid}`) : null;
        if (socket) socket.close();
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        if (drafts) localStorage.setItem(`drafts_${uid}`, drafts);
        set({
            token: null,
            refreshToken: null,
            user: null,
            keys: null,
            keysStatus: 'idle',
            socket: null,
            selectedChat: null,
            activeCall: null,
            incomingCall: null,
            showSettings: false,
            isSyncing: false,
            activeChatId: null,
            activeChatType: null,
            sessionNotice: null,
        });
    },

    updateUser: (updated) => {
        const userWithId = { ...updated, id: updated._id || updated.id };
        localStorage.setItem('user', JSON.stringify(userWithId));
        set({ user: userWithId });
    },
}));
