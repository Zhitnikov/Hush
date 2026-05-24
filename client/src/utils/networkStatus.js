import { create } from 'zustand';

export const useNetworkStore = create((set) => ({
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  setOnline: (online) => set({ online }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useNetworkStore.getState().setOnline(true));
  window.addEventListener('offline', () => useNetworkStore.getState().setOnline(false));
}
