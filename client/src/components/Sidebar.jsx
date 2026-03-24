import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Users, Hash, Plus, LogOut, Search, ShieldCheck, Settings, FolderPlus, X, Check, Pin, PinOff, Bookmark, BellOff } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import clsx from 'clsx';
import { API_BASE } from '../config';
import { useSidebarSelectors } from '../stores/sidebarStore';

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
            setUsers(usersRes.data);
            setChannels(channelsRes.data);
            setFolders(foldersRes.data);
        } catch (err) { console.error(err); }
    }, [token]);

    useEffect(() => {
        fetchData();
        const intervalId = setInterval(fetchData, 12000);
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

        const handleNewMsg = (msg) => {
            const selId = selectedChat?.id != null ? String(selectedChat.id) : '';
            const myId = String(currentUser?.id);
            if (msg.isChannel) {
                const ch = msg.channel?._id || msg.channel;
                const channelId = ch != null ? String(ch) : '';
                if (!channelId) return;
                if (channelId === selId) return;
                setChannels(prev => prev.map(c =>
                    String(c._id) === channelId ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
                ));
            } else {
                const rawSender = msg.sender?._id || msg.sender;
                const senderId = rawSender != null ? String(rawSender) : '';
                if (!senderId || senderId === myId) return;
                if (senderId === selId) return;
                setUsers(prev => prev.map(u =>
                    String(u._id) === senderId ? { ...u, unreadCount: (u.unreadCount || 0) + 1 } : u
                ));
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

    const allChats = useMemo(() => [
        {
            _id: currentUser.id,
            type: 'user',
            name: 'Saved Messages',
            initials: 'SM',
            isSavedMessages: true,
            status: 'online'
        },
        ...users.map(u => ({ ...u, type: 'user', name: u.username, initials: u.username[0].toUpperCase() })),
        ...channels.map(c => ({ ...c, type: 'channel', name: c.name, initials: c.name[0].toUpperCase() }))
    ].map(c => ({
        ...c,
        isPinned: pinnedChats.includes(c._id),
        isMuted: currentUser?.mutedChats?.includes(c._id)
    }))
        .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => (b.isPinned - a.isPinned)), [users, channels, currentUser, pinnedChats, searchQuery]);

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

    const getStatusDisplay = (u) => {
        if (u.status === 'online') return <span className="text-blue-500 font-medium">online</span>;
        if (!u.lastSeen) return <span className="text-gray-400">offline</span>;
        try { return <span className="text-gray-400">last seen {formatDistanceToNow(new Date(u.lastSeen))} ago</span>; } catch { return <span className="text-gray-400">offline</span>; }
    };

    const renderChatRow = (c) => (
        <div
            onClick={() => {
                onSelectChat({ type: c.type, id: c._id, name: c.name, publicKey: c.publicKey, lastSeen: c.lastSeen });
                if (c.type === 'user') setUsers(prev => prev.map(u => u._id === c._id ? { ...u, unreadCount: 0 } : u));
                else setChannels(prev => prev.map(ch => ch._id === c._id ? { ...ch, unreadCount: 0 } : ch));
            }}
            className={clsx(
                'flex items-center px-5 py-4 cursor-pointer transition-all border-l-4 group',
                selectedChat?.id === c._id ? 'bg-blue-50 border-blue-500' : 'hover:bg-gray-50 border-transparent'
            )}
        >
            <div className={clsx(
                'w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg mr-4 relative shrink-0 shadow-sm',
                c.isSavedMessages ? 'bg-blue-500 text-white' : (c.type === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600')
            )}>
                {c.isSavedMessages ? <Bookmark size={20} fill="currentColor" /> : c.initials}
                {c.type === 'user' && !c.isSavedMessages && c.status === 'online' && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full shadow-sm" />}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                    <h3 className="text-gray-900 font-semibold text-sm truncate">{c.name}</h3>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {c.isMuted && <BellOff size={10} className="text-gray-400" />}
                        {c.isPinned && <Pin size={10} className="text-blue-500 fill-blue-500" />}
                        {c.publicKey && <ShieldCheck size={12} className="text-blue-400" />}
                        {c.unreadCount > 0 ? (
                            <div className="min-w-[18px] h-[18px] bg-blue-500 rounded-full flex items-center justify-center px-1">
                                <span className="text-[10px] font-bold text-white leading-none">{c.unreadCount}</span>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setPinnedChats(prev => prev.includes(c._id) ? prev.filter(id => id !== c._id) : [c._id, ...prev]);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-500 transition-opacity"
                            >
                                {c.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                            </button>
                        )}
                    </div>
                </div>
                <p className="text-xs truncate">{getStatusDisplay(c)}</p>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-white w-full shadow-sm overflow-hidden border-r border-gray-100">
            <div className="p-5 border-b border-gray-50 flex items-center justify-between shrink-0">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Chats</h1>
                <div className="flex gap-1">
                    <div className="relative group">
                        <button type="button" className="p-2 text-blue-500 hover:bg-blue-50 rounded-full transition-all" title="Create New"><Plus size={20} /></button>
                        <div className="absolute right-0 top-full mt-1 bg-white shadow-2xl rounded-2xl border border-gray-100 py-2 w-48 invisible group-hover:visible z-[100] animate-scale transform origin-top-right">
                            <button type="button" onClick={() => setShowCreateGroup(true)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"><Users size={16} /> New Group/Channel</button>
                            <button type="button" onClick={() => setShowCreateFolder(true)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"><FolderPlus size={16} /> New Folder</button>
                        </div>
                    </div>
                    <button type="button" onClick={onOpenSettings} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-all" title="Settings"><Settings size={20} /></button>
                    <button type="button" onClick={onLogout} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all" title="Logout"><LogOut size={20} /></button>
                </div>
            </div>

            <div className="px-5 py-3 shrink-0">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search chats & cloud..."
                        className="w-full bg-gray-100/80 text-gray-900 text-sm rounded-full pl-11 pr-10 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all border border-transparent"
                    />
                    {searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-900"><X size={14} /></button>}
                </div>
            </div>

            <div className="flex px-5 gap-2 overflow-x-auto no-scrollbar py-2 border-b border-gray-50 shrink-0">
                <button type="button" onClick={() => setActiveTab('all')} className={clsx(
                    'px-4 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all',
                    activeTab === 'all' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100'
                )}>All</button>
                {folders.map(f => (
                    <div key={f._id} className="relative group">
                        <button type="button" onClick={() => setActiveTab(f._id)} className={clsx(
                            'px-4 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all',
                            activeTab === f._id ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100'
                        )}>{f.name}</button>
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
                            <div key={u._id} onClick={() => onSelectChat({ type: 'user', id: u._id, name: u.username })} className="flex items-center gap-4 cursor-pointer hover:bg-gray-50 p-2 rounded-2xl transition-all">
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

            {showCreateGroup && (
                <div className="fixed inset-0 z-[100] bg-black/20 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-[32px] shadow-xl p-6 animate-scale">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-gray-900 font-bold text-lg">New Group/Channel</h3>
                            <button type="button" onClick={() => setShowCreateGroup(false)}><X className="text-gray-400" /></button>
                        </div>
                        <form onSubmit={handleCreateGroup} className="space-y-4">
                            <input autoFocus value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Name" className="w-full bg-gray-50 border border-gray-100 p-4 rounded-2xl outline-none focus:border-blue-500" />
                            <div className="flex gap-2 p-1 bg-gray-50 rounded-2xl">
                                <button type="button" onClick={() => setNewGroupType('group')} className={clsx('flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl', newGroupType === 'group' ? 'bg-white text-blue-500 shadow-sm' : 'text-gray-400')}>Discussion Group</button>
                                <button type="button" onClick={() => setNewGroupType('broadcast')} className={clsx('flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl', newGroupType === 'broadcast' ? 'bg-white text-blue-500 shadow-sm' : 'text-gray-400')}>Broadcast Channel</button>
                            </div>
                            <p className="text-[10px] text-gray-400 px-2 leading-relaxed">
                                {newGroupType === 'group' ? 'Interactive room where everyone can send messages.' : 'One-way channel where only you (admin) can post updates.'}
                            </p>
                            <button type="submit" className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold shadow-lg hover:bg-blue-600">Create</button>
                        </form>
                    </div>
                </div>
            )}

            {showCreateFolder && (
                <div className="fixed inset-0 z-[100] bg-black/20 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-3xl shadow-xl overflow-hidden flex flex-col p-6 border border-gray-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-gray-900 font-bold text-lg">New Folder</h3>
                            <button type="button" onClick={() => setShowCreateFolder(false)} className="text-gray-400 hover:text-gray-600"><X /></button>
                        </div>
                        <form onSubmit={handleCreateFolder} className="space-y-6">
                            <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Folder Name" className="w-full bg-gray-50 border border-gray-100 p-4 rounded-2xl outline-none focus:border-blue-500/50 transition-all text-sm" />
                            <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2">
                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Select chats</p>
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
                            <button type="submit" className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold text-sm shadow-md hover:bg-blue-600 transition-all">Create Folder</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
