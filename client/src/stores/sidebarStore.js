import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { ensureArray } from '../utils/ensureArray';

export const useSidebarStore = create((set) => {
  const setUsers = (value) =>
    set((state) => {
      const current = ensureArray(state.users);
      const next = typeof value === 'function' ? value(current) : value;
      return { users: ensureArray(next) };
    });

  const setChannels = (value) =>
    set((state) => {
      const current = ensureArray(state.channels);
      const next = typeof value === 'function' ? value(current) : value;
      return { channels: ensureArray(next) };
    });

  const setFolders = (value) =>
    set((state) => {
      const current = ensureArray(state.folders);
      const next = typeof value === 'function' ? value(current) : value;
      return { folders: ensureArray(next) };
    });

  return {
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

    setUsers,
    setChannels,
    setFolders,
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setActiveTab: (activeTab) => set({ activeTab }),
    setShowCreateFolder: (showCreateFolder) => set({ showCreateFolder }),
    setShowCreateGroup: (showCreateGroup) => set({ showCreateGroup }),
    setNewFolderName: (newFolderName) => set({ newFolderName }),
    setNewGroupName: (newGroupName) => set({ newGroupName }),
    setNewGroupType: (newGroupType) => set({ newGroupType }),
    setSelectedForFolder: (fn) =>
      set((s) => ({
        selectedForFolder: typeof fn === 'function' ? fn(s.selectedForFolder) : fn,
      })),
    setPinnedChats: (fn) =>
      set((s) => ({
        pinnedChats: typeof fn === 'function' ? fn(ensureArray(s.pinnedChats)) : ensureArray(fn),
      })),
    setGlobalResults: (globalResults) =>
      set({
        globalResults: {
          users: ensureArray(globalResults?.users),
          channels: ensureArray(globalResults?.channels),
        },
      }),
    setGlobalMsgResults: (globalMsgResults) =>
      set({ globalMsgResults: ensureArray(globalMsgResults) }),
    setIsGlobalSearching: (isGlobalSearching) => set({ isGlobalSearching }),

    initPinnedForUser: (userId) => {
      if (!userId) return;
      try {
        const raw = localStorage.getItem(`pinned_${userId}`);
        set({ pinnedChats: raw ? ensureArray(JSON.parse(raw)) : [] });
      } catch {
        set({ pinnedChats: [] });
      }
    },

    persistPinned: (userId, pinnedChats) => {
      if (!userId) return;
      localStorage.setItem(`pinned_${userId}`, JSON.stringify(ensureArray(pinnedChats)));
    },

    resetModals: () =>
      set({
        showCreateFolder: false,
        showCreateGroup: false,
        newFolderName: '',
        newGroupName: '',
        newGroupType: 'group',
        selectedForFolder: [],
      }),
  };
});

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
