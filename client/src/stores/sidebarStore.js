import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export const useSidebarStore = create((set, get) => ({
    users: [],
    channels: [],
    folders: [],
    searchQuery: '',
    activeTab: 'all',
    showCreateFolder: false,
    showCreateGroup: false,
    newFolderName: '',
    newGroupName: '',
    newGroupType: 'group',
    selectedForFolder: [],
    pinnedChats: [],
    globalResults: { users: [], channels: [] },
    globalMsgResults: [],
    isGlobalSearching: false,

    setUsers: (users) => set({ users }),
    setChannels: (channels) => set({ channels }),
    setFolders: (folders) => set({ folders }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setActiveTab: (activeTab) => set({ activeTab }),
    setShowCreateFolder: (showCreateFolder) => set({ showCreateFolder }),
    setShowCreateGroup: (showCreateGroup) => set({ showCreateGroup }),
    setNewFolderName: (newFolderName) => set({ newFolderName }),
    setNewGroupName: (newGroupName) => set({ newGroupName }),
    setNewGroupType: (newGroupType) => set({ newGroupType }),
    setSelectedForFolder: (fn) => set((s) => ({ selectedForFolder: typeof fn === 'function' ? fn(s.selectedForFolder) : fn })),
    setPinnedChats: (fn) => set((s) => ({ pinnedChats: typeof fn === 'function' ? fn(s.pinnedChats) : fn })),
    setGlobalResults: (globalResults) => set({ globalResults }),
    setGlobalMsgResults: (globalMsgResults) => set({ globalMsgResults }),
    setIsGlobalSearching: (isGlobalSearching) => set({ isGlobalSearching }),

    initPinnedForUser: (userId) => {
        if (!userId) return;
        try {
            const raw = localStorage.getItem(`pinned_${userId}`);
            set({ pinnedChats: raw ? JSON.parse(raw) : [] });
        } catch {
            set({ pinnedChats: [] });
        }
    },

    persistPinned: (userId, pinnedChats) => {
        if (!userId) return;
        localStorage.setItem(`pinned_${userId}`, JSON.stringify(pinnedChats));
    },

    resetModals: () => set({
        showCreateFolder: false,
        showCreateGroup: false,
        newFolderName: '',
        newGroupName: '',
        newGroupType: 'group',
        selectedForFolder: []
    })
}));

export function useSidebarSelectors() {
    return useSidebarStore(
        useShallow((s) => ({
            users: s.users,
            channels: s.channels,
            folders: s.folders,
            searchQuery: s.searchQuery,
            activeTab: s.activeTab,
            showCreateFolder: s.showCreateFolder,
            showCreateGroup: s.showCreateGroup,
            newFolderName: s.newFolderName,
            newGroupName: s.newGroupName,
            newGroupType: s.newGroupType,
            selectedForFolder: s.selectedForFolder,
            pinnedChats: s.pinnedChats,
            globalResults: s.globalResults,
            globalMsgResults: s.globalMsgResults,
            isGlobalSearching: s.isGlobalSearching,
            setUsers: s.setUsers,
            setChannels: s.setChannels,
            setFolders: s.setFolders,
            setSearchQuery: s.setSearchQuery,
            setActiveTab: s.setActiveTab,
            setShowCreateFolder: s.setShowCreateFolder,
            setShowCreateGroup: s.setShowCreateGroup,
            setNewFolderName: s.setNewFolderName,
            setNewGroupName: s.setNewGroupName,
            setNewGroupType: s.setNewGroupType,
            setSelectedForFolder: s.setSelectedForFolder,
            setPinnedChats: s.setPinnedChats,
            setGlobalResults: s.setGlobalResults,
            setGlobalMsgResults: s.setGlobalMsgResults,
            setIsGlobalSearching: s.setIsGlobalSearching,
            initPinnedForUser: s.initPinnedForUser,
            persistPinned: s.persistPinned,
        }))
    );
}
