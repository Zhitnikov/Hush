import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Users, Hash, Plus, LogOut, Search, ShieldCheck, Settings, FolderPlus, X, Check, Pin, PinOff, Bookmark, BellOff } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import clsx from 'clsx';
import { API_BASE } from '../config';
import { useSidebarSelectors } from '../stores/sidebarStore';
import { useAppStore } from '../stores/appStore';
import { ensureArray } from '../utils/ensureArray';
import { messagePreviewLabel } from '../utils/messagePreview';
import { decryptMessage } from '../utils/crypto';

export default function Sidebar({ token, onSelectChat, selectedChat, onLogout, currentUser, socket, onOpenSettings }) {
    const {
        users,
        channels,
        folders,
        searchQuery,
        activeTab,
        showCreateFolder,
        showCreateGroup,
        newFolderName,
        newGroupName,
        newGroupType,
        selectedForFolder,
        pinnedChats,
        globalResults,
        globalMsgResults,
        isGlobalSearching,
        setUsers,
        setChannels,
        setFolders,
        setSearchQuery,
        setActiveTab,
        setShowCreateFolder,
        setShowCreateGroup,
        setNewFolderName,
        setNewGroupName,
        setNewGroupType,
        setSelectedForFolder,
        setPinnedChats,
        setGlobalResults,
        setGlobalMsgResults,
        setIsGlobalSearching,
        initPinnedForUser,
        persistPinned,
    } = useSidebarSelectors();

    const listParentRef = useRef(null);
    const createMenuRef = useRef(null);
    const [showCreateMenu, setShowCreateMenu] = useState(false);

    useEffect(() => {
        if (!showCreateMenu) return;
        const onPointerDown = (e) => {
            if (createMenuRef.current && !createMenuRef.current.contains(e.target)) {
                setShowCreateMenu(false);
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [showCreateMenu]);

    useEffect(() => {
        if (currentUser?.id) initPinnedForUser(currentUser.id);
    }, [currentUser?.id, initPinnedForUser]);

    useEffect(() => {
        if (currentUser?.id) persistPinned(currentUser.id, pinnedChats);
    }, [pinnedChats, currentUser?.id, persistPinned]);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setGlobalResults({ users: [], channels: [] });
            setGlobalMsgResults([]);
            return;
        }
        const delayDebounceFn = setTimeout(async () => {
            try {
                const resDir = await axios.get(`${API_BASE}/directory/search?q=${encodeURIComponent(searchQuery)}`, { headers: { Authorization: `Bearer ${token}` } });
                setGlobalResults(resDir.data);
                setIsGlobalSearching(true);
                const resMsgs = await axios.get(`${API_BASE}/search-global?query=${encodeURIComponent(searchQuery)}`, { headers: { Authorization: `Bearer ${token}` } });
                setGlobalMsgResults(resMsgs.data);
                setIsGlobalSearching(false);
            } catch (e) {
                console.error(e);
                setIsGlobalSearching(false);
            }
        }, 500);
        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery, token]);

    const fetchData = useCallback(async () => {
        try {
            const [usersRes, channelsRes, foldersRes] = await Promise.all([
                axios.get(`${API_BASE}/users`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_BASE}/channels`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_BASE}/folders`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            setUsers(ensureArray(usersRes.data));
            setChannels(ensureArray(channelsRes.data));
            setFolders(ensureArray(foldersRes.data));
        } catch (err) {
            if (err.response?.status === 401) return;
            if (err.response?.status === 429) return;
            console.error('Sidebar fetchData failed', err);
        }
    }, [token, setUsers, setChannels, setFolders]);

    useEffect(() => {
        fetchData();
        const intervalId = setInterval(fetchData, 45000);
        const onVisibility = () => {
            if (document.visibilityState === 'visible') fetchData();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [fetchData]);

    useEffect(() => {
        if (!socket) return;

        const handleStatus = ({ userId, status, lastSeen }) => {
            setUsers(prev => prev.map(u => u._id === userId ? { ...u, status, lastSeen } : u));
        };

        const handleNewMsg = async (msg) => {
            const selId = selectedChat?.id != null ? String(selectedChat.id) : '';
            const myId = String(currentUser?.id);
            let preview = messagePreviewLabel(msg);
            const keys = useAppStore.getState().keys;
            if (keys?.privateKey && msg.content && !msg.fileUrl) {
                try {
                    const dec = await decryptMessage(msg.content, keys.privateKey, null, keys.publicKey);
                    preview = messagePreviewLabel(msg, dec);
                } catch {
                    
                }
            }
            const at = msg.createdAt || new Date().toISOString();

            if (msg.isChannel) {
                const ch = msg.channel?._id || msg.channel;
                const channelId = ch != null ? String(ch) : '';
                if (!channelId) return;
                const sid = String(msg.sender?._id || msg.sender || '');
                const bumpUnread = channelId !== selId && sid !== myId;
                setChannels((prev) =>
                    prev.map((c) =>
                        String(c._id) === channelId
                            ? {
                                  ...c,
                                  lastMessage: preview,
                                  lastMessageAt: at,
                                  unreadCount: bumpUnread ? (c.unreadCount || 0) + 1 : c.unreadCount,
                              }
                            : c
                    )
                );
            } else {
                const sid = String(msg.sender?._id || msg.sender || '');
                const rid = String(msg.receiver?._id || msg.receiver || '');
                const peerId = sid === myId ? rid : sid;
                if (!peerId) return;
                const bumpUnread = peerId !== selId && sid !== myId;
                setUsers((prev) =>
                    prev.map((u) =>
                        String(u._id) === peerId
                            ? {
                                  ...u,
                                  lastMessage: preview,
                                  lastMessageAt: at,
                                  unreadCount: bumpUnread ? (u.unreadCount || 0) + 1 : u.unreadCount,
                              }
                            : u
                    )
                );
            }
        };

        socket.on('user_status_change', handleStatus);
        socket.on('receive_message', handleNewMsg);

        return () => {
            socket.off('user_status_change', handleStatus);
            socket.off('receive_message', handleNewMsg);
        };
    }, [socket, selectedChat?.id, currentUser?.id]);

    const handleCreateFolder = async (e) => {
        e.preventDefault();
        if (!newFolderName.trim()) return;
        try {
            const res = await axios.post(`${API_BASE}/folders`, { name: newFolderName, chats: selectedForFolder }, { headers: { Authorization: `Bearer ${token}` } });
            setFolders(res.data);
            setNewFolderName('');
            setSelectedForFolder([]);
            setShowCreateFolder(false);
        } catch (e) { console.error(e); }
    };

    const handleCreateGroup = async (e) => {
        e.preventDefault();
        if (!newGroupName.trim()) return;
        try {
            const res = await axios.post(`${API_BASE}/channels`, { name: newGroupName, type: newGroupType }, { headers: { Authorization: `Bearer ${token}` } });
            setChannels(prev => [...prev, res.data]);
            setNewGroupName('');
            setNewGroupType('group');
            setShowCreateGroup(false);
        } catch (e) { console.error(e); }
    };

    const currentFolder = folders.find(f => f._id === activeTab);

    const userList = ensureArray(users);
    const channelList = ensureArray(channels);

    const allChats = useMemo(() => [
        {
            _id: currentUser.id,
            type: 'user',
            name: 'Saved Messages',
            initials: 'SM',
            isSavedMessages: true,
            status: 'online'
        },
        ...userList.map(u => ({
            ...u,
            type: 'user',
            name: u.username || 'User',
            initials: (u.username?.[0] || '?').toUpperCase(),
        })),
        ...channelList.map(c => ({
            ...c,
            type: 'channel',
            name: c.name || 'Channel',
            initials: (c.name?.[0] || '#').toUpperCase(),
        }))
    ].map(c => ({
        ...c,
        isPinned: pinnedChats.includes(c._id),
        isMuted: currentUser?.mutedChats?.includes(c._id)
    }))
        .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            if (b.isPinned !== a.isPinned) return b.isPinned - a.isPinned;
            const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return tb - ta;
        }), [userList, channelList, currentUser, pinnedChats, searchQuery]);

    const displayedChats = useMemo(() => (
        activeTab === 'all'
            ? allChats
            : allChats.filter(c => currentFolder?.chats?.includes(c._id))
    ), [allChats, activeTab, currentFolder]);

    const rowVirtualizer = useVirtualizer({
        count: displayedChats.length,
        getScrollElement: () => listParentRef.current,
        estimateSize: () => 78,
        overscan: 10,
        getItemKey: (index) => String(displayedChats[index]?._id ?? index),
    });

    const getStatusDisplay = (u, active) => {
        const muted = active ? 'hush-chat-sub' : 'text-[var(--text-secondary)]';
        if (u.status === 'online') return <span className={active ? '' : 'text-[var(--accent)]'}>в сети</span>;
        if (!u.lastSeen) return <span className={muted}>не в сети</span>;
        try {
            return (
                <span className={clsx(muted, 'truncate block max-w-full')}>
                    {formatDistanceToNow(new Date(u.lastSeen), { addSuffix: true, locale: ru })}
                </span>
            );
        } catch { return <span className={muted}>не в сети</span>; }
    };

    const renderChatRow = (c) => {
        const active = selectedChat?.id === c._id;
        return (
        <div
            onClick={() => {
                onSelectChat({ type: c.type, id: c._id, name: c.name, publicKey: c.publicKey, lastSeen: c.lastSeen });
                if (c.type === 'user') setUsers(prev => prev.map(u => u._id === c._id ? { ...u, unreadCount: 0 } : u));
                else setChannels(prev => prev.map(ch => ch._id === c._id ? { ...ch, unreadCount: 0 } : ch));
            }}
            className={clsx('hush-chat-row group', active && 'hush-chat-row-active')}
        >
            <div className={clsx(
                'hush-avatar',
                c.isSavedMessages ? 'bg-[var(--accent)] text-white' : (c.type === 'user' ? 'bg-[#dfe6eb] text-[var(--accent)]' : 'bg-[#e8dff5] text-[#6b4fa0]')
            )}>
                {c.isSavedMessages ? <Bookmark size={20} fill="currentColor" /> : c.initials}
                {c.type === 'user' && !c.isSavedMessages && c.status === 'online' && (
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#0ac630] border-2 border-white rounded-full" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline gap-2">
                    <h3 className="font-medium text-[15px] truncate">{c.name}</h3>
                    <div className="flex items-center gap-1 shrink-0">
                        {c.isMuted && <BellOff size={12} className={active ? 'opacity-80' : 'text-[var(--text-secondary)]'} />}
                        {c.isPinned && <Pin size={12} className={active ? 'opacity-90' : 'text-[var(--accent)]'} />}
                        {c.unreadCount > 0 && <span className="hush-unread">{c.unreadCount}</span>}
                    </div>
                </div>
                <p className={clsx('text-[13px] truncate hush-chat-sub', !active && 'text-[var(--text-secondary)]')}>
                    {c.lastMessage ? (
                        <span className={c.unreadCount > 0 ? 'font-medium text-[var(--text-primary)]' : ''}>{c.lastMessage}</span>
                    ) : (
                        getStatusDisplay(c, active)
                    )}
                </p>
            </div>
            {!active && c.unreadCount === 0 && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setPinnedChats(prev => prev.includes(c._id) ? prev.filter(id => id !== c._id) : [c._id, ...prev]);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-[var(--text-secondary)] hover:text-[var(--accent)]"
                >
                    {c.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
            )}
            {c.publicKey && !active && <ShieldCheck size={14} className="text-[var(--accent)] opacity-60 shrink-0" />}
        </div>
    );};

    return (
        <div className="flex flex-col h-full hush-sidebar w-full overflow-hidden">
            <div className="hush-sidebar-header shrink-0">
                <h1 className="text-[15px] font-semibold">Hush</h1>
                <div className="flex gap-0.5">
                    <div className="relative" ref={createMenuRef}>
                        <button
                            type="button"
                            className="hush-btn-icon"
                            title="Создать"
                            aria-expanded={showCreateMenu}
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowCreateMenu((v) => !v);
                            }}
                        >
                            <Plus size={20} />
                        </button>
                        {showCreateMenu && (
                            <div className="absolute right-0 top-full mt-1 bg-white shadow-lg rounded-lg border border-[var(--border)] py-1 w-44 z-[100]">
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowCreateMenu(false);
                                        setShowCreateGroup(true);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-hover)] flex items-center gap-2"
                                >
                                    <Users size={16} /> Группа / канал
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowCreateMenu(false);
                                        setShowCreateFolder(true);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-hover)] flex items-center gap-2"
                                >
                                    <FolderPlus size={16} /> Папка
                                </button>
                            </div>
                        )}
                    </div>
                    <button type="button" onClick={onOpenSettings} className="hush-btn-icon" title="Настройки"><Settings size={20} /></button>
                    <button type="button" onClick={onLogout} className="hush-btn-icon hover:!text-red-500" title="Выход"><LogOut size={20} /></button>
                </div>
            </div>

            <div className="px-3 py-2 shrink-0">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={16} />
                    <input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Поиск"
                        className="hush-search"
                    />
                    {searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"><X size={14} /></button>}
                </div>
            </div>

            <div className="flex px-3 gap-1 overflow-x-auto no-scrollbar py-2 border-b border-[var(--border-light)] shrink-0">
                <button type="button" onClick={() => setActiveTab('all')} className={clsx('hush-tab', activeTab === 'all' && 'hush-tab-active')}>Все</button>
                {folders.map(f => (
                    <div key={f._id} className="relative group">
                        <button type="button" onClick={() => setActiveTab(f._id)} className={clsx('hush-tab', activeTab === f._id && 'hush-tab-active')}>{f.name}</button>
                        <button
                            type="button"
                            onClick={async () => { await axios.delete(`${API_BASE}/folders/${encodeURIComponent(f.name)}`, { headers: { Authorization: `Bearer ${token}` } }); fetchData(); setActiveTab('all'); }}
                            className="absolute -top-1 -right-1 bg-gray-900 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        ><X size={8} /></button>
                    </div>
                ))}
            </div>

            <div ref={listParentRef} className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                {searchQuery.trim() && (globalResults.users.length > 0 || globalResults.channels.length > 0) && (
                    <div className="px-5 py-4 space-y-4">
                        <p className="text-[10px] uppercase font-black text-blue-500 tracking-widest border-b border-blue-50 pb-2">Global Search Results</p>
                        {globalResults.users.map(u => (
                            <div key={u._id} onClick={() => onSelectChat({ type: 'user', id: u._id, name: u.username, publicKey: u.publicKey, lastSeen: u.lastSeen })} className="flex items-center gap-4 cursor-pointer hover:bg-gray-50 p-2 rounded-2xl transition-all">
                                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">{u.username[0].toUpperCase()}</div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-bold text-gray-900 truncate">{u.username}</h4>
                                    <p className="text-[10px] text-gray-400 uppercase font-black tracking-tighter">Person</p>
                                </div>
                                <Plus size={16} className="text-gray-300" />
                            </div>
                        ))}
                        {globalResults.channels.map(c => (
                            <div key={c._id} onClick={() => onSelectChat({ type: 'channel', id: c._id, name: c.name })} className="flex items-center gap-4 cursor-pointer hover:bg-gray-50 p-2 rounded-2xl transition-all">
                                <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-sm">{c.name[0].toUpperCase()}</div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-bold text-gray-900 truncate">{c.name}</h4>
                                    <p className="text-[10px] text-gray-400 uppercase font-black tracking-tighter">Channel</p>
                                </div>
                                <Hash size={16} className="text-gray-300" />
                            </div>
                        ))}

                        {globalMsgResults.length > 0 && (
                            <div className="pt-4 space-y-3">
                                <p className="text-[10px] uppercase font-black text-blue-500 tracking-widest border-b border-blue-50 pb-2">Messages in Cloud</p>
                                {globalMsgResults.map(r => (
                                    <div key={r._id} onClick={() => onSelectChat({ id: r.channel || (r.sender?._id === currentUser.id ? r.receiver : r.sender?._id), type: r.channel ? 'channel' : 'user', name: r.sender?.username })} className="p-3 bg-blue-50/20 rounded-2xl border border-blue-50/50 cursor-pointer hover:bg-blue-50 transition-all">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[10px] font-bold text-blue-600">@{r.sender?.username}</span>
                                            <span className="text-[8px] text-gray-400 font-bold">{format(new Date(r.createdAt), 'MMM d')}</span>
                                        </div>
                                        <p className="text-xs text-gray-600 truncate italic">&quot;{r.content}&quot;</p>
                                    </div>
                                ))}
                            </div>
                        )}
                        {isGlobalSearching && (
                            <p className="text-[10px] text-gray-400 text-center">Searching…</p>
                        )}
                        <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest border-b border-gray-50 pb-2 mt-6">My Chats</p>
                    </div>
                )}

                {displayedChats.length === 0 ? (
                    <div className="text-center py-20 px-6">
                        <p className="text-gray-400 text-sm italic">No chats found</p>
                    </div>
                ) : (
                    <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
                        {rowVirtualizer.getVirtualItems().map(vi => {
                            const c = displayedChats[vi.index];
                            return (
                                <div
                                    key={vi.key}
                                    data-index={vi.index}
                                    ref={rowVirtualizer.measureElement}
                                    className="absolute top-0 left-0 w-full"
                                    style={{ transform: `translateY(${vi.start}px)` }}
                                >
                                    {renderChatRow(c)}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {(showCreateGroup || showCreateFolder) && createPortal(
                <>
                    {showCreateGroup && (
                        <div
                            className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center p-4"
                            onMouseDown={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
                        >
                            <div
                                className="bg-white w-full max-w-sm rounded-[32px] shadow-xl p-6"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-gray-900 font-bold text-lg">Новая группа / канал</h3>
                                    <button type="button" onClick={() => setShowCreateGroup(false)}><X className="text-gray-400" /></button>
                                </div>
                                <form onSubmit={handleCreateGroup} className="space-y-4">
                                    <input autoFocus value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Название" className="w-full bg-gray-50 border border-gray-100 p-4 rounded-2xl outline-none focus:border-blue-500" />
                                    <div className="flex flex-col sm:flex-row gap-2 p-1 bg-gray-50 rounded-2xl">
                                        <button type="button" onClick={() => setNewGroupType('group')} className={clsx('flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl', newGroupType === 'group' ? 'bg-white text-blue-500 shadow-sm' : 'text-gray-400')}>Группа</button>
                                        <button type="button" onClick={() => setNewGroupType('broadcast')} className={clsx('flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl', newGroupType === 'broadcast' ? 'bg-white text-blue-500 shadow-sm' : 'text-gray-400')}>Канал</button>
                                    </div>
                                    <button type="submit" className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold shadow-lg hover:bg-blue-600">Создать</button>
                                </form>
                            </div>
                        </div>
                    )}
                    {showCreateFolder && (
                        <div
                            className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center p-4"
                            onMouseDown={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
                        >
                            <div
                                className="bg-white w-full max-w-sm rounded-3xl shadow-xl flex flex-col p-6 border border-gray-100 max-h-[90vh]"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex justify-between items-center mb-6 shrink-0">
                                    <h3 className="text-gray-900 font-bold text-lg">Новая папка</h3>
                                    <button type="button" onClick={() => setShowCreateFolder(false)} className="text-gray-400 hover:text-gray-600"><X /></button>
                                </div>
                                <form onSubmit={handleCreateFolder} className="space-y-4 flex flex-col min-h-0">
                                    <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Название папки" className="w-full bg-gray-50 border border-gray-100 p-4 rounded-2xl outline-none focus:border-blue-500/50 text-sm shrink-0" />
                                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2">
                                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Чаты в папке</p>
                                        {allChats.map(c => (
                                            <div key={c._id} onClick={() => setSelectedForFolder(prev => prev.includes(c._id) ? prev.filter(id => id !== c._id) : [...prev, c._id])}
                                                className={clsx(
                                                    'flex items-center p-3 rounded-2xl cursor-pointer border transition-all',
                                                    selectedForFolder.includes(c._id) ? 'bg-blue-50 border-blue-500/30' : 'bg-white border-transparent hover:bg-gray-50'
                                                )}>
                                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold mr-3">{c.initials}</div>
                                                <span className="text-sm text-gray-700 flex-1">{c.name}</span>
                                                <div className={clsx('w-5 h-5 rounded-full border-2 flex items-center justify-center', selectedForFolder.includes(c._id) ? 'bg-blue-500 border-blue-500' : 'border-gray-200')}>
                                                    {selectedForFolder.includes(c._id) && <Check size={12} className="text-white" />}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button type="submit" className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold text-sm shadow-md hover:bg-blue-600 shrink-0">Создать папку</button>
                                </form>
                            </div>
                        </div>
                    )}
                </>,
                document.body
            )}
        </div>
    );
}
