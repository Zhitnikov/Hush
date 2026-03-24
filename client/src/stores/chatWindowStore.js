import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

function initialData() {
    return {
        messages: [],
        hasMoreOlder: true,
        loadingOlder: false,
        loadingInitial: true,
        newMessage: '',
        uploading: false,
        recording: false,
        recordingMode: 'voice',
        mediaRecorder: null,
        videoPreviewStream: null,
        showInfo: false,
        groupKey: null,
        userStatus: { status: 'offline', lastSeen: null },
        editingMessage: null,
        replyingTo: null,
        showSearch: false,
        localSearchQuery: '',
        typingUser: null,
        showMedia: false,
        reactionsMsgId: null,
        forwardingMsg: null,
        partnerDetails: null,
        linkPreview: null,
        scheduledDelay: 0,
        showPicker: false,
        pickerTab: 'emoji',
        bloomReaction: null,
        wallpaper: '#f4f7f9',
        showPollModal: false,
        pollQuestion: '',
        pollOptions: ['', ''],
        stats: null,
        isMuted: false,
        alias: '',
        bubbleColor: '#eeffde',
        pinnedMsg: null,
        replyTo: null,
        mediaTab: 'photos',
        transcriptions: {},
        transcribingId: null,
    };
}

export const useChatWindowStore = create((set, get) => ({
    ...initialData(),

    patch: (partial) => set((s) => ({ ...s, ...partial })),

    resetForChatSwitch: (chat, currentUser) => {
        const wall = localStorage.getItem(`wallpaper_${currentUser?.id}`) || '#f4f7f9';
        set({
            ...initialData(),
            messages: [],
            hasMoreOlder: true,
            loadingInitial: true,
            userStatus: { status: 'offline', lastSeen: chat.lastSeen },
            wallpaper: wall,
            isMuted: currentUser?.mutedChats?.includes(chat.id),
            alias: currentUser?.aliases?.[chat.id] || '',
            bubbleColor: currentUser?.chatPreferences?.[chat.id]?.bubbleColor || (String(chat.id) === String(currentUser?.id) ? '#eeffde' : '#ffffff'),
        });
    },

    setMessages: (fn) => set((s) => ({ messages: typeof fn === 'function' ? fn(s.messages) : fn })),
    setTranscriptions: (fn) => set((s) => ({ transcriptions: typeof fn === 'function' ? fn(s.transcriptions) : fn })),
    setPollOptions: (fn) => set((s) => ({ pollOptions: typeof fn === 'function' ? fn(s.pollOptions) : fn })),
}));

export function useChatWindowSelectors() {
    return useChatWindowStore(
        useShallow((s) => ({
            messages: s.messages,
            hasMoreOlder: s.hasMoreOlder,
            loadingOlder: s.loadingOlder,
            loadingInitial: s.loadingInitial,
            newMessage: s.newMessage,
            uploading: s.uploading,
            recording: s.recording,
            recordingMode: s.recordingMode,
            mediaRecorder: s.mediaRecorder,
            videoPreviewStream: s.videoPreviewStream,
            showInfo: s.showInfo,
            groupKey: s.groupKey,
            userStatus: s.userStatus,
            editingMessage: s.editingMessage,
            replyingTo: s.replyingTo,
            showSearch: s.showSearch,
            localSearchQuery: s.localSearchQuery,
            typingUser: s.typingUser,
            showMedia: s.showMedia,
            reactionsMsgId: s.reactionsMsgId,
            forwardingMsg: s.forwardingMsg,
            partnerDetails: s.partnerDetails,
            linkPreview: s.linkPreview,
            scheduledDelay: s.scheduledDelay,
            showPicker: s.showPicker,
            pickerTab: s.pickerTab,
            bloomReaction: s.bloomReaction,
            wallpaper: s.wallpaper,
            showPollModal: s.showPollModal,
            pollQuestion: s.pollQuestion,
            pollOptions: s.pollOptions,
            stats: s.stats,
            isMuted: s.isMuted,
            alias: s.alias,
            bubbleColor: s.bubbleColor,
            pinnedMsg: s.pinnedMsg,
            replyTo: s.replyTo,
            mediaTab: s.mediaTab,
            transcriptions: s.transcriptions,
            transcribingId: s.transcribingId,
            patch: s.patch,
            setMessages: s.setMessages,
            setTranscriptions: s.setTranscriptions,
            setPollOptions: s.setPollOptions,
            resetForChatSwitch: s.resetForChatSwitch,
        }))
    );
}
