import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { X, User, Shield, Lock, Moon, LogOut, Camera, Check, Loader2, Ban, AtSign, ArrowLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { API_BASE as API_CHAT, API_ORIGIN } from '../config';
import { loadAppearance, saveAppearance } from '../utils/appearance';
import { exportMediaBackup, importMediaBackup } from '../utils/mediaBackup';

const API_AUTH = `${API_ORIGIN}/api/auth`;

const TABS = [
    { id: 'profile', label: 'Профиль', icon: User, color: 'text-blue-500' },
    { id: 'security', label: 'Безопасность', icon: Lock, color: 'text-green-500' },
    { id: 'privacy', label: 'Приватность', icon: Ban, color: 'text-red-500' },
    { id: 'appearance', label: 'Оформление', icon: Moon, color: 'text-purple-500' },
];

const LAST_SEEN_LABELS = {
    everybody: 'Все',
    contacts: 'Контакты',
    nobody: 'Никто',
};

function PrivacyOptionList({ value, options, onSelect }) {
    return (
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden divide-y divide-gray-50">
            {options.map((v) => (
                <button
                    key={v}
                    type="button"
                    onClick={() => onSelect(v)}
                    className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
                >
                    <span>{LAST_SEEN_LABELS[v] || v}</span>
                    {value === v && <Check size={18} className="text-blue-500 shrink-0" />}
                </button>
            ))}
        </div>
    );
}

export default function SettingsModal({ user, token, onClose, onUpdateUser }) {
    const [activeTab, setActiveTab] = useState('profile');
    const [mobilePanel, setMobilePanel] = useState(null);
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
    const [appearance, setAppearance] = useState(() => loadAppearance());

    const fileInputRef = useRef(null);

    const showMsg = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    };

    const openTab = (tabId) => {
        setActiveTab(tabId);
        setMobilePanel(tabId);
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await axios.put(`${API_AUTH}/profile`, profileData, { headers: { Authorization: `Bearer ${token}` } });
            onUpdateUser(res.data);
            showMsg('success', 'Профиль обновлён');
        } catch (err) { showMsg('error', 'Не удалось сохранить'); } finally { setLoading(false); }
    };

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        if (passwords.new !== passwords.confirm) return showMsg('error', 'Пароли не совпадают');
        setLoading(true);
        try {
            await axios.put(`${API_AUTH}/password`, { currentPassword: passwords.current, newPassword: passwords.new }, { headers: { Authorization: `Bearer ${token}` } });
            setPasswords({ current: '', new: '', confirm: '' });
            showMsg('success', 'Пароль изменён');
        } catch (err) { showMsg('error', err.response?.data?.msg || 'Ошибка'); } finally { setLoading(false); }
    };

    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 280 * 1024) {
            showMsg('error', 'Аватар до 280 КБ');
            return;
        }
        setLoading(true);
        try {
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            setProfileData((prev) => ({ ...prev, profilePic: dataUrl }));
            const updated = await axios.put(`${API_AUTH}/profile`, { profilePic: dataUrl }, { headers: { Authorization: `Bearer ${token}` } });
            onUpdateUser(updated.data);
            showMsg('success', 'Аватар обновлён');
        } catch (err) {
            showMsg('error', 'Загрузка не удалась');
        } finally {
            setLoading(false);
        }
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
            showMsg('success', 'Пользователь разблокирован');
        } catch (err) {
            showMsg('error', err.response?.data?.msg || 'Ошибка');
        }
    };

    const handleUpdatePrivacySettings = async (visibility) => {
        try {
            await axios.post(`${API_CHAT}/privacy`, { lastSeenVisibility: visibility }, { headers: { Authorization: `Bearer ${token}` } });
            setPrivacySettings(prev => ({ ...prev, lastSeenVisibility: visibility }));
            showMsg('success', 'Приватность обновлена');
        } catch (err) { showMsg('error', 'Не удалось сохранить'); }
    };

    const handleUpdateDND = async (data) => {
        try {
            await axios.post(`${API_CHAT}/dnd`, {
                enabled: data.enabled,
                start: data.schedule?.start,
                end: data.schedule?.end
            }, { headers: { Authorization: `Bearer ${token}` } });
            setDndSettings(data);
            showMsg('success', 'Режим «Не беспокоить» обновлён');
        } catch (err) { showMsg('error', 'Не удалось сохранить'); }
    };

    useEffect(() => { if (activeTab === 'privacy') fetchBlacklist(); }, [activeTab]);

    const activeTabMeta = TABS.find(t => t.id === activeTab);
    const showMobileMenu = mobilePanel === null;

    const renderTabContent = () => {
        if (activeTab === 'profile') {
            return (
                <form onSubmit={handleUpdateProfile} className="max-w-md mx-auto space-y-6 md:space-y-8">
                    <div className="flex flex-col items-center">
                        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current.click()}>
                            <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-blue-50 flex items-center justify-center border-2 border-white shadow-md overflow-hidden ring-4 ring-blue-500/5">
                                {profileData.profilePic ? (
                                    <img src={`${API_ORIGIN}${profileData.profilePic}`} className="w-full h-full object-cover" alt="" />
                                ) : (
                                    <span className="text-3xl md:text-4xl font-bold text-blue-500">{user.username[0].toUpperCase()}</span>
                                )}
                            </div>
                            <div className="absolute bottom-0 right-0 bg-white p-2 rounded-full shadow-md border border-gray-100 text-blue-500">
                                <Camera size={16} />
                            </div>
                            <input type="file" ref={fileInputRef} className="hidden" onChange={handleAvatarUpload} accept="image/*" />
                        </div>
                        <div className="mt-4 text-center">
                            <h4 className="font-bold text-gray-900">@{profileData.username || user.username}</h4>
                            <p className="text-xs text-gray-400 mt-1">Имя, username и описание</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 ml-1">Имя</label>
                            <input value={profileData.name} onChange={e => setProfileData(prev => ({ ...prev, name: e.target.value }))} className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 outline-none focus:border-blue-500/30 text-sm" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 ml-1">Username</label>
                            <div className="relative">
                                <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                                <input value={profileData.username} onChange={e => setProfileData(prev => ({ ...prev, username: e.target.value }))} className="w-full bg-gray-50 border border-gray-100 rounded-2xl pl-11 pr-4 py-3 outline-none focus:border-blue-500/30 text-sm" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 ml-1">О себе</label>
                            <textarea value={profileData.bio} onChange={e => setProfileData(prev => ({ ...prev, bio: e.target.value }))} rows={3} className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 outline-none focus:border-blue-500/30 text-sm resize-none" />
                        </div>
                    </div>

                    <button type="submit" disabled={loading} className="w-full py-3.5 bg-blue-500 text-white rounded-2xl font-bold text-sm shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                        {loading ? <Loader2 className="animate-spin" /> : <><Check size={18} /> Сохранить</>}
                    </button>

                    <div className="pt-8 border-t border-gray-50 flex flex-col items-center">
                        <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">QR профиля</h5>
                        <div className="p-3 bg-white rounded-3xl border-4 border-blue-500/5 shadow-inner">
                            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${user.username}`} className="w-28 h-28" alt="QR" />
                        </div>
                    </div>
                </form>
            );
        }

        if (activeTab === 'security') {
            return (
                <form onSubmit={handleUpdatePassword} className="max-w-md mx-auto space-y-5">
                    <p className="text-xs text-blue-600 bg-blue-50 p-3 rounded-xl font-medium leading-relaxed">Надёжный пароль защищает доступ к аккаунту и E2E-ключам.</p>
                    {[
                        { id: 'current', label: 'Текущий пароль' },
                        { id: 'new', label: 'Новый пароль' },
                        { id: 'confirm', label: 'Повторите пароль' },
                    ].map(f => (
                        <div key={f.id} className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 ml-1">{f.label}</label>
                            <input type="password" value={passwords[f.id]} onChange={e => setPasswords(prev => ({ ...prev, [f.id]: e.target.value }))} className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 outline-none focus:border-blue-500/30 text-sm" />
                        </div>
                    ))}
                    <button type="submit" className="w-full py-3.5 bg-gray-900 text-white rounded-2xl font-bold text-sm active:scale-[0.98] transition-all">Сменить пароль</button>
                </form>
            );
        }

        if (activeTab === 'privacy') {
            return (
                <div className="max-w-md mx-auto space-y-8">
                    <section className="space-y-3">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Кто видит «был(а) в сети»</h4>
                        <PrivacyOptionList
                            value={privacySettings.lastSeenVisibility}
                            options={['everybody', 'contacts', 'nobody']}
                            onSelect={handleUpdatePrivacySettings}
                        />
                    </section>

                    <section className="space-y-3">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Не беспокоить</h4>
                        <div className="bg-gray-50 p-4 rounded-2xl space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-900">Без уведомлений</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">По расписанию или вручную</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleUpdateDND({ ...dndSettings, enabled: !dndSettings.enabled })}
                                    className={clsx("w-11 h-6 rounded-full transition-all relative shrink-0", dndSettings.enabled ? "bg-blue-500" : "bg-gray-200")}
                                >
                                    <div className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm", dndSettings.enabled ? "left-6" : "left-1")} />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">С</label>
                                    <input type="time" value={dndSettings.schedule.start} onChange={e => handleUpdateDND({ ...dndSettings, schedule: { ...dndSettings.schedule, start: e.target.value } })} className="w-full bg-white border border-gray-100 p-2.5 rounded-xl text-xs font-bold outline-none" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">До</label>
                                    <input type="time" value={dndSettings.schedule.end} onChange={e => handleUpdateDND({ ...dndSettings, schedule: { ...dndSettings.schedule, end: e.target.value } })} className="w-full bg-white border border-gray-100 p-2.5 rounded-xl text-xs font-bold outline-none" />
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Чёрный список</h4>
                        {loadingBlacklist ? <Loader2 className="animate-spin mx-auto text-blue-500" /> : blacklist.length === 0 ? (
                            <p className="text-center text-gray-400 text-xs py-4 bg-gray-50 rounded-2xl">Список пуст</p>
                        ) : blacklist.map(u => (
                            <div key={u._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                <span className="font-bold text-xs text-gray-900">@{u.username}</span>
                                <button type="button" onClick={() => unblockUser(u._id)} className="text-[10px] font-bold text-red-500">Разблокировать</button>
                            </div>
                        ))}
                    </section>

                    <button type="button" onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full py-3 border-2 border-dashed border-red-100 rounded-2xl text-red-500 font-bold text-[10px] uppercase tracking-widest hover:bg-red-50 transition-all">
                        Очистить кэш приложения
                    </button>
                </div>
            );
        }

        const BG_PRESETS = ['#e4ddd4', '#dfe6eb', '#f4f7f9', '#e8f5e9', '#1e2a35'];
        const BUBBLE_PRESETS = ['#eeffde', '#3390ec', '#fff9c4', '#fce4ec', '#ffffff'];

        return (
            <div className="max-w-md mx-auto space-y-8">
                <section className="space-y-3">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Фон чата</h4>
                    <div className="flex flex-wrap gap-2">
                        {BG_PRESETS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => {
                                    const next = { ...appearance, chatBackground: c };
                                    setAppearance(next);
                                    saveAppearance(next);
                                    showMsg('success', 'Фон сохранён');
                                }}
                                className={clsx(
                                    'w-10 h-10 rounded-xl border-2',
                                    appearance.chatBackground === c ? 'border-blue-500 scale-110' : 'border-transparent'
                                )}
                                style={{ background: c }}
                            />
                        ))}
                    </div>
                </section>
                <section className="space-y-3">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Цвет ваших сообщений</h4>
                    <div className="flex flex-wrap gap-2">
                        {BUBBLE_PRESETS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => {
                                    const next = { ...appearance, bubbleMe: c };
                                    setAppearance(next);
                                    saveAppearance(next);
                                    showMsg('success', 'Цвет сохранён');
                                }}
                                className={clsx(
                                    'w-10 h-10 rounded-xl border-2',
                                    appearance.bubbleMe === c ? 'border-blue-500 scale-110' : 'border-transparent'
                                )}
                                style={{ background: c }}
                            />
                        ))}
                    </div>
                </section>
                <section className="space-y-3 border-t border-gray-100 pt-6">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Медиа на устройстве</h4>
                    <p className="text-xs text-gray-500 px-1 leading-relaxed">
                        Фото и файлы хранятся в IndexedDB. Сервер только передаёт зашифрованные чанки.
                    </p>
                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={() => exportMediaBackup().then(() => showMsg('success', 'Бэкап скачан'))}
                            className="w-full py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-sm font-medium hover:bg-gray-100"
                        >
                            Экспорт медиа (JSON)
                        </button>
                        <label className="w-full py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-sm font-medium hover:bg-gray-100 text-center cursor-pointer">
                            Импорт медиа
                            <input
                                type="file"
                                accept="application/json"
                                className="hidden"
                                onChange={async (ev) => {
                                    const f = ev.target.files?.[0];
                                    if (!f) return;
                                    try {
                                        const n = await importMediaBackup(f);
                                        showMsg('success', `Импортировано: ${n}`);
                                    } catch {
                                        showMsg('error', 'Импорт не удался');
                                    }
                                }}
                            />
                        </label>
                    </div>
                </section>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-0 lg:p-4 fade-in" onClick={onClose}>
            <div
                className="bg-white w-full h-full max-h-[100dvh] lg:h-[640px] lg:max-w-4xl lg:rounded-[32px] shadow-2xl flex flex-col lg:flex-row overflow-hidden min-w-0"
                onClick={(e) => e.stopPropagation()}
            >
                {}
                <div className="hidden lg:flex w-72 bg-gray-50 border-r border-gray-100 p-8 flex-col shrink-0">
                    <h2 className="text-xl font-bold text-gray-900 mb-8">Настройки</h2>
                    <nav className="flex-1 space-y-1">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                type="button"
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
                </div>

                {}
                {showMobileMenu && (
                    <div className="flex flex-col flex-1 lg:hidden min-h-0 min-w-0">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                            <h2 className="text-lg font-bold text-gray-900">Настройки</h2>
                            <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full"><X size={20} /></button>
                        </div>
                        <nav className="flex-1 overflow-y-auto custom-scrollbar">
                            {TABS.map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => openTab(tab.id)}
                                    className="w-full flex items-center gap-3 px-4 py-4 border-b border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                                >
                                    <tab.icon size={20} className={tab.color} />
                                    <span className="flex-1 font-medium text-gray-900">{tab.label}</span>
                                    <ChevronRight size={18} className="text-gray-300 shrink-0" />
                                </button>
                            ))}
                        </nav>
                    </div>
                )}

                {}
                <div className={clsx(
                    "flex-1 flex flex-col relative bg-white min-h-0 min-w-0",
                    showMobileMenu ? "hidden lg:flex" : "flex"
                )}>
                    <div className="px-4 md:px-8 py-3 md:py-0 md:h-[72px] border-b border-gray-50 flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => setMobilePanel(null)}
                            className="lg:hidden p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full"
                            aria-label="Назад"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <h3 className="text-lg font-bold text-gray-900 flex-1 truncate">
                            {activeTabMeta?.label || 'Настройки'}
                        </h3>
                        <button type="button" onClick={onClose} className="hidden lg:block p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full"><X size={20} /></button>
                        <button type="button" onClick={onClose} className="lg:hidden p-2 text-gray-400 hover:bg-gray-100 rounded-full"><X size={20} /></button>
                    </div>

                    {message.text && (
                        <div className={clsx(
                            "absolute top-16 md:top-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs font-bold shadow-lg z-[130] border max-w-[90%] text-center",
                            message.type === 'success' ? "bg-green-500 text-white border-green-600" : "bg-red-500 text-white border-red-600"
                        )}>
                            {message.text}
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-10">
                        {renderTabContent()}
                    </div>
                </div>
            </div>
        </div>
    );
}
