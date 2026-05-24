import axios from 'axios';


export const LT_BYPASS_HEADER = 'bypass-tunnel-reminder';

export function isLocaltunnelHost(hostname = typeof window !== 'undefined' ? window.location.hostname : '') {
    return /\.loca\.lt$/i.test(hostname);
}

export function getLocaltunnelHeaders() {
    if (typeof window === 'undefined' || !isLocaltunnelHost()) {
        return {};
    }
    return { [LT_BYPASS_HEADER]: 'true' };
}


export function applyLocaltunnelBypass() {
    if (typeof window === 'undefined' || !isLocaltunnelHost()) return;
    axios.defaults.headers.common[LT_BYPASS_HEADER] = 'true';
}
