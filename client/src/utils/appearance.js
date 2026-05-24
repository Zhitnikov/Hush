const STORAGE_KEY = 'hush_appearance';

const DEFAULTS = {
    chatBackground: '#e4ddd4',
    bubbleMe: '#eeffde',
    bubbleOther: '#ffffff',
};

export function loadAppearance() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
        return { ...DEFAULTS };
    }
}

export function saveAppearance(settings) {
    const next = { ...DEFAULTS, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    applyAppearance(next);
    return next;
}

export function applyAppearance(settings = loadAppearance()) {
    const root = document.documentElement;
    root.style.setProperty('--bg-chat', settings.chatBackground);
    root.style.setProperty('--bg-bubble-me', settings.bubbleMe);
    root.style.setProperty('--bg-bubble-other', settings.bubbleOther);
    window.dispatchEvent(new CustomEvent('hush-appearance', { detail: settings }));
}
