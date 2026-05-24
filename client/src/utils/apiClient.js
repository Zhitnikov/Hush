import axios from 'axios';
import { API_ORIGIN } from '../config';
import { getLocaltunnelHeaders } from './localtunnel';
import { useAppStore, claimSessionExpiry } from '../stores/appStore';

const api = axios.create({ baseURL: API_ORIGIN });

function attachAuthHeaders(config) {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    Object.assign(config.headers, getLocaltunnelHeaders());
    return config;
}

function shouldHandleSessionExpiry(config) {
    const url = String(config?.url || '');
    if (config?._skipAuthHandler) return false;
    if (url.includes('/api/auth/login') || url.includes('/api/auth/register')) return false;
    return true;
}

export function handleSessionExpired(message) {
    const store = useAppStore.getState();
    const hasSession = store.token || localStorage.getItem('token');
    if (!hasSession) return;
    if (!claimSessionExpiry()) return;
    store.showSessionExpired(message || 'Срок действия сессии истёк. Войдите снова.');
}

async function onResponseError(error, client) {
    if (error.response?.status === 429) {
        return Promise.reject(error);
    }

    const original = error.config;
    if (error.response?.status !== 401 || !original || original._retry) {
        return Promise.reject(error);
    }

    if (!shouldHandleSessionExpiry(original)) {
        return Promise.reject(error);
    }

    if (String(original.url || '').includes('/api/auth/refresh')) {
        handleSessionExpired();
        return Promise.reject(error);
    }

    original._retry = true;
    const refresh = localStorage.getItem('refreshToken');

    if (refresh) {
        try {
            const { data } = await axios.post(
                `${API_ORIGIN}/api/auth/refresh`,
                { refreshToken: refresh },
                { _skipAuthHandler: true, headers: getLocaltunnelHeaders() }
            );
            localStorage.setItem('token', data.token);
            localStorage.setItem('refreshToken', data.refreshToken);
            useAppStore.getState().setToken(data.token);
            original.headers.Authorization = `Bearer ${data.token}`;
            return client(original);
        } catch {
            handleSessionExpired();
            return Promise.reject(error);
        }
    }

    handleSessionExpired();
    return Promise.reject(error);
}

export function installAxiosAuth(client) {
    client.interceptors.request.use((config) => attachAuthHeaders(config));
    client.interceptors.response.use(
        (r) => r,
        (error) => onResponseError(error, client)
    );
}

installAxiosAuth(api);


export function setupGlobalAxiosAuth() {
    installAxiosAuth(axios);
}

export default api;
