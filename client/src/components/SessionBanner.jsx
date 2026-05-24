import { useAppStore } from '../stores/appStore';
import { X } from 'lucide-react';

export default function SessionBanner() {
    const notice = useAppStore((s) => s.sessionNotice);
    const clearSessionNotice = useAppStore((s) => s.clearSessionNotice);

    if (!notice) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[220] safe-top px-3 pt-2 pointer-events-none">
            <div
                className="pointer-events-auto mx-auto max-w-lg flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-950 shadow-lg px-4 py-3 text-sm"
                role="alert"
            >
                <div className="flex-1 min-w-0">
                    <p className="font-semibold">Сессия завершена</p>
                    <p className="mt-0.5 opacity-90 leading-snug">{notice}</p>
                </div>
                <button
                    type="button"
                    onClick={clearSessionNotice}
                    className="shrink-0 p-1 rounded-lg hover:bg-amber-100/80"
                    aria-label="Закрыть"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
