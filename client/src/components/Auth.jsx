import React, { useState } from 'react';
import axios from 'axios';
import { ShieldCheck, MessageSquare, UserPlus, LogIn } from 'lucide-react';
import clsx from 'clsx';
import { API_ORIGIN } from '../config';

const API_URL = `${API_ORIGIN}/api/auth`;

export default function Auth({ onLogin }) {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const endpoint = isLogin ? '/login' : '/register';
            const res = await axios.post(`${API_URL}${endpoint}`, { username, password });
            onLogin(res.data.user, res.data.token);
        } catch (err) {
            setError(err.response?.data?.msg || err.message || 'Authentication failed. Check if server is running.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-[420px] bg-white/90 backdrop-blur-sm p-8 sm:p-10 rounded-2xl shadow-[0_8px_40px_rgba(15,23,42,0.08)] border border-slate-200/80 relative overflow-hidden fade-in">
                <div className="absolute -top-32 -right-32 w-72 h-72 bg-blue-500/[0.06] rounded-full blur-3xl pointer-events-none" />

                <div className="text-center mb-8 relative">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-500/25">
                        <MessageSquare className="text-white" size={30} strokeWidth={2} />
                    </div>
                    <h1 className="text-2xl sm:text-[1.65rem] font-semibold text-slate-900 tracking-tight">Secure Messenger</h1>
                    <p className="text-slate-500 text-sm mt-2">End-to-end encrypted conversations</p>
                </div>

                <div className="flex bg-slate-100/90 p-1 rounded-xl mb-8 relative border border-slate-200/60">
                    <div
                        className={clsx(
                            'absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm border border-slate-200/80 transition-all duration-300 ease-out',
                            isLogin ? 'left-1' : 'left-[calc(50%+0px)]'
                        )}
                    />
                    <button
                        type="button"
                        onClick={() => setIsLogin(true)}
                        className={clsx('flex-1 py-2.5 text-sm font-medium rounded-lg relative z-10 transition-colors', isLogin ? 'text-blue-600' : 'text-slate-500')}
                    >
                        Sign in
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsLogin(false)}
                        className={clsx('flex-1 py-2.5 text-sm font-medium rounded-lg relative z-10 transition-colors', !isLogin ? 'text-blue-600' : 'text-slate-500')}
                    >
                        Create account
                    </button>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl mb-6 text-sm text-center border border-red-100">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <label htmlFor="auth-username" className="text-sm font-medium text-slate-700">Username</label>
                        <input
                            id="auth-username"
                            type="text"
                            autoComplete="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400 transition-all"
                            placeholder="Your username"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="auth-password" className="text-sm font-medium text-slate-700">Password</label>
                        <input
                            id="auth-password"
                            type="password"
                            autoComplete={isLogin ? 'current-password' : 'new-password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400 transition-all"
                            placeholder="••••••••"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 text-base"
                    >
                        {loading ? (
                            'Please wait…'
                        ) : isLogin ? (
                            <><LogIn size={20} /> Sign in</>
                        ) : (
                            <><UserPlus size={20} /> Create account</>
                        )}
                    </button>
                </form>

                <p className="mt-8 text-center text-sm text-slate-500">
                    {isLogin ? "Don't have an account?" : 'Already registered?'}
                    <button
                        type="button"
                        onClick={() => setIsLogin(!isLogin)}
                        className="ml-2 text-blue-600 font-semibold hover:underline underline-offset-2"
                    >
                        {isLogin ? 'Register' : 'Sign in'}
                    </button>
                </p>
            </div>

            <div className="mt-10 flex items-center gap-2 text-slate-400 text-xs">
                <ShieldCheck size={16} className="text-blue-500 shrink-0" />
                <span>RSA-OAEP keys for private messaging</span>
            </div>
        </div>
    );
}
