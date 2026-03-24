import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { X, User, Shield, Lock, Moon, LogOut, Camera, Check, Loader2, Ban, AtSign, Info } from 'lucide-react';
import clsx from 'clsx';
import { API_BASE as API_CHAT, API_ORIGIN } from '../config';

const API_AUTH = `${API_ORIGIN}/api/auth`;

export default function SettingsModal({ user, token, onClose, onUpdateUser }) {
    const [activeTab, setActiveTab] = useState('profile');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const [profileData, setProfileData] = useState({
        name: user.name || '',
        username: user.username || '',
        bio: user.bio || '',
        profilePic: user.profilePic || ''
    });

    const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
    const [blacklist, setBlacklist] = useState([]);
    const [loadingBlacklist, setLoadingBlacklist] = useState(false);
    const [privacySettings, setPrivacySettings] = useState(user.privacy || { lastSeenVisibility: 'everybody' });
    const [dndSettings, setDndSettings] = useState(() => {
        const dnd = user.dnd || {};
        return {
            enabled: dnd.enabled || false,
            schedule: dnd.schedule || { start: '22:00', end: '08:00' }
        };
    });

    const fileInputRef = useRef(null);

    const showMsg = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await axios.put(`${API_AUTH}/profile`, profileData, { headers: { Authorization: `Bearer ${token}` } });
            onUpdateUser(res.data);
            showMsg('success', 'Profile updated');
        } catch (err) { showMsg('error', 'Update failed'); } finally { setLoading(false); }
    };

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        if (passwords.new !== passwords.confirm) return showMsg('error', 'Passwords do not match');
        setLoading(true);
        try {
            await axios.put(`${API_AUTH}/password`, { currentPassword: passwords.current, newPassword: passwords.new }, { headers: { Authorization: `Bearer ${token}` } });
            setPasswords({ current: '', new: '', confirm: '' });
            showMsg('success', 'Password updated');
        } catch (err) { showMsg('error', err.response?.data?.msg || 'Update failed'); } finally { setLoading(false); }
    };

    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        setLoading(true);
        try {
            const res = await axios.post(`${API_CHAT}/upload`, fd, { headers: { Authorization: `Bearer ${token}` } });
            const newPic = res.data.fileUrl;
            setProfileData(prev => ({ ...prev, profilePic: newPic }));
            const updated = await axios.put(`${API_AUTH}/profile`, { profilePic: newPic }, { headers: { Authorization: `Bearer ${token}` } });
            onUpdateUser(updated.data);
            showMsg('success', 'Avatar updated');
        } catch (err) { showMsg('error', 'Upload failed'); } finally { setLoading(false); }
    };

    const fetchBlacklist = async () => {
        setLoadingBlacklist(true);
        try {
            const res = await axios.get(`${API_AUTH}/blacklist`, { headers: { Authorization: `Bearer ${token}` } });
            setBlacklist(res.data);
        } catch (err) { console.error(err); } finally { setLoadingBlacklist(false); }
    };

    const unblockUser = async (targetId) => {
        try {
            await axios.post(`${API_AUTH}/block`, { targetId }, { headers: { Authorization: `Bearer ${token}` } });
            await fetchBlacklist();
            showMsg('success', 'User unblocked');
        } catch (err) {
            showMsg('error', err.response?.data?.msg || 'Could not unblock');
        }
    };

    const handleUpdatePrivacySettings = async (visibility) => {
        try {
            await axios.post(`${API_CHAT}/privacy`, { lastSeenVisibility: visibility }, { headers: { Authorization: `Bearer ${token}` } });
            setPrivacySettings(prev => ({ ...prev, lastSeenVisibility: visibility }));
            showMsg('success', 'Privacy updated');
        } catch (err) { showMsg('error', 'Privacy update failed'); }
    };

    const handleUpdateDND = async (data) => {
        try {
            await axios.post(`${API_CHAT}/dnd`, {
                enabled: data.enabled,
                start: data.schedule?.start,
                end: data.schedule?.end
            }, { headers: { Authorization: `Bearer ${token}` } });
            setDndSettings(data);
            showMsg('success', 'DND settings updated');
        } catch (err) { showMsg('error', 'DND update failed'); }
    };

    useEffect(() => { if (activeTab === 'privacy') fetchBlacklist(); }, [activeTab]);

    return (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4 fade-in">
            <div className="bg-white w-full max-w-4xl h-[640px] rounded-[32px] shadow-2xl flex overflow-hidden">

                <div className="w-72 bg-gray-50 border-r border-gray-100 p-8 flex flex-col">
                    <h2 className="text-xl font-bold text-gray-900 mb-8">Settings</h2>
                    <nav className="flex-1 space-y-1">
                        {[
                            { id: 'profile', label: 'Profile', icon: User, color: 'text-blue-500' },
                            { id: 'security', label: 'Security', icon: Lock, color: 'text-green-500' },
                            { id: 'privacy', label: 'Privacy', icon: Ban, color: 'text-red-500' },
                            { id: 'appearance', label: 'Appearance', icon: Moon, color: 'text-purple-500' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={clsx(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-semibold text-sm",
                                    activeTab === tab.id ? "bg-white text-blue-600 shadow-sm border border-gray-100" : "text-gray-500 hover:bg-white/50"
                                )}
                            >
                                <tab.icon size={18} className={activeTab === tab.id ? tab.color : "text-gray-400"} />
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </nav>
                    <button className="flex items-center gap-2 text-red-500 text-xs font-bold mt-8 p-4 hover:bg-red-50 rounded-2xl transition-all">
                        <LogOut size={16} /> Logout All Sessions
                    </button>
                </div>

                <div className="flex-1 flex flex-col relative bg-white">
                    <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-900 capitalize">{activeTab}</h3>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all"><X size={20} /></button>
                    </div>

                    {message.text && (
                        <div className={clsx(
                            "absolute top-24 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full text-xs font-bold shadow-lg z-[130] fade-in border",
                            message.type === 'success' ? "bg-green-500 text-white border-green-600" : "bg-red-500 text-white border-red-600"
                        )}>
                            {message.text}
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-10">
                        {activeTab === 'profile' && (
                            <form onSubmit={handleUpdateProfile} className="max-w-md mx-auto space-y-8">
                                <div className="flex flex-col items-center">
                                    <div className="relative group cursor-pointer" onClick={() => fileInputRef.current.click()}>
                                        <div className="w-28 h-28 rounded-full bg-blue-50 flex items-center justify-center border-2 border-white shadow-md overflow-hidden ring-4 ring-blue-500/5">
                                            {profileData.profilePic ? (
                                                <img src={`${API_ORIGIN}${profileData.profilePic}`} className="w-full h-full object-cover" alt="" />
                                            ) : (
                                                <span className="text-4xl font-bold text-blue-500">{user.username[0].toUpperCase()}</span>
                                            )}
                                        </div>
                                        <div className="absolute bottom-0 right-0 bg-white p-2 rounded-full shadow-md border border-gray-100 text-blue-500">
                                            <Camera size={16} />
                                        </div>
                                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleAvatarUpload} accept="image/*" />
                                    </div>
                                    <div className="mt-4 text-center">
                                        <h4 className="font-bold text-gray-900">@{profileData.username || user.username}</h4>
                                        <p className="text-xs text-gray-400 mt-1">Manage your identity data</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 ml-1">Full Name</label>
                                        <input value={profileData.name} onChange={e => setProfileData(prev => ({ ...prev, name: e.target.value }))} className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-3 outline-none focus:border-blue-500/30 transition-all text-sm" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 ml-1">Username</label>
                                        <div className="relative">
                                            <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                                            <input value={profileData.username} onChange={e => setProfileData(prev => ({ ...prev, username: e.target.value }))} className="w-full bg-gray-50 border border-gray-100 rounded-2xl pl-11 pr-5 py-3 outline-none focus:border-blue-500/30 transition-all text-sm" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 ml-1">About</label>
                                        <textarea value={profileData.bio} onChange={e => setProfileData(prev => ({ ...prev, bio: e.target.value }))} rows={3} className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-3 outline-none focus:border-blue-500/30 transition-all text-sm resize-none" />
                                    </div>
                                </div>

                                <button type="submit" disabled={loading} className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold text-sm shadow-lg hover:shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2">
                                    {loading ? <Loader2 className="animate-spin" /> : <><Check size={18} /> Update Profile</>}
                                </button>

                                <div className="pt-10 border-t border-gray-50 flex flex-col items-center">
                                    <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Your Profile QR ID</h5>
                                    <div className="p-4 bg-white rounded-[32px] border-4 border-blue-500/5 shadow-inner">
                                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${user.username}`} className="w-32 h-32" alt="QR ID" />
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-4 text-center max-w-[200px]">Let others scan this to quickly find your professional profile.</p>
                                </div>
                            </form>
                        )}

                        {activeTab === 'security' && (
                            <form onSubmit={handleUpdatePassword} className="max-w-md mx-auto space-y-6">
                                <p className="text-xs text-blue-500 bg-blue-50 p-4 rounded-2xl font-semibold leading-relaxed mb-8">Maintain a secure password to protect your end-to-end encrypted conversations.</p>
                                {[
                                    { id: 'current', label: 'Current Password', icon: Lock },
                                    { id: 'new', label: 'New Password', icon: Shield },
                                    { id: 'confirm', label: 'Verify Password', icon: Check },
                                ].map(f => (
                                    <div key={f.id} className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 ml-1">{f.label}</label>
                                        <input type="password" value={passwords[f.id]} onChange={e => setPasswords(prev => ({ ...prev, [f.id]: e.target.value }))} className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-3 outline-none focus:border-blue-500/30 transition-all text-sm" />
                                    </div>
                                ))}
                                <button type="submit" className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-all mt-6">Change Password</button>
                            </form>
                        )}

                        {activeTab === 'privacy' && (
                            <div className="max-w-md mx-auto space-y-10">
                                <section className="space-y-4">
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Stealth Mode</h4>
                                    <div className="bg-gray-50 p-6 rounded-[24px] space-y-6">
                                        <p className="text-[11px] text-gray-500 font-medium">Control who can see your online presence and last seen status.</p>
                                        <div className="flex bg-white p-1 rounded-2xl border border-gray-100">
                                            {['everybody', 'contacts', 'nobody'].map(v => (
                                                <button
                                                    key={v}
                                                    onClick={() => handleUpdatePrivacySettings(v)}
                                                    className={clsx(
                                                        "flex-1 py-2 text-[10px] font-bold capitalize rounded-xl transition-all",
                                                        privacySettings.lastSeenVisibility === v ? "bg-blue-500 text-white shadow-md shadow-blue-500/20" : "text-gray-400 hover:text-gray-600"
                                                    )}
                                                >{v}</button>
                                            ))}
                                        </div>
                                    </div>
                                </section>

                                <section className="space-y-4">
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Focus Mode (DND)</h4>
                                    <div className="bg-gray-50 p-6 rounded-[24px] space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-bold text-gray-900">Mute all notifications</p>
                                                <p className="text-[10px] text-gray-400 mt-1 font-medium italic">Instant silence for all conversations</p>
                                            </div>
                                            <button
                                                onClick={() => handleUpdateDND({ ...dndSettings, enabled: !dndSettings.enabled })}
                                                className={clsx("w-12 h-6 rounded-full transition-all relative", dndSettings.enabled ? "bg-blue-500" : "bg-gray-200")}
                                            >
                                                <div className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm", dndSettings.enabled ? "left-7" : "left-1")} />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase">Start focus</label>
                                                <input type="time" value={dndSettings.schedule.start} onChange={e => handleUpdateDND({ ...dndSettings, schedule: { ...dndSettings.schedule, start: e.target.value } })} className="w-full bg-white border border-gray-100 p-3 rounded-xl text-xs font-bold outline-none" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase">End focus</label>
                                                <input type="time" value={dndSettings.schedule.end} onChange={e => handleUpdateDND({ ...dndSettings, schedule: { ...dndSettings.schedule, end: e.target.value } })} className="w-full bg-white border border-gray-100 p-3 rounded-xl text-xs font-bold outline-none" />
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section className="space-y-4">
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Blacklist</h4>
                                    <div className="space-y-2">
                                        {loadingBlacklist ? <Loader2 className="animate-spin mx-auto text-blue-500 mt-6" /> : blacklist.length === 0 ? (
                                            <p className="text-center text-gray-400 text-[11px] font-medium py-4 bg-gray-50 rounded-2xl italic">Your blacklist is empty</p>
                                        ) : blacklist.map(u => (
                                            <div key={u._id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-[10px] text-red-500 border border-gray-100">{u.username[0].toUpperCase()}</div>
                                                    <span className="font-bold text-xs text-gray-900">@{u.username}</span>
                                                </div>
                                                <button onClick={() => unblockUser(u._id)} className="text-[10px] font-bold text-red-500 hover:underline">Unblock</button>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full py-4 border-2 border-dashed border-red-100 rounded-[24px] text-red-500 font-bold text-[10px] uppercase tracking-widest hover:bg-red-50 transition-all">Clear All App Data & Cache</button>
                            </div>
                        )}

                        {activeTab === 'appearance' && (
                            <div className="max-w-md mx-auto text-center py-20">
                                <p className="text-sm text-gray-500 font-medium">Dark mode and custom themes will return soon in a more performant update.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
