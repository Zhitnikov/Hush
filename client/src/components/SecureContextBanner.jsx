import { getDevHttpsUrl, getSecureContextMessage, isSecureCryptoAvailable } from '../utils/cryptoEnvironment';
import { useAppStore } from '../stores/appStore';

export default function SecureContextBanner() {
    const keysStatus = useAppStore((s) => s.keysStatus);
    const user = useAppStore((s) => s.user);

    if (!user) return null;

    const cryptoMsg = getSecureContextMessage();
    const needsBanner = keysStatus === 'needs-secure-context' || (!isSecureCryptoAvailable() && cryptoMsg);

    if (!needsBanner) return null;

    const hintUrl = cryptoMsg?.hintUrl || getDevHttpsUrl();
    const title = cryptoMsg?.title || 'Нужно HTTPS для шифрования';
    const body = cryptoMsg?.body || 'Откройте приложение по защищённому адресу.';

    return (
        <div className="fixed top-0 left-0 right-0 z-[210] bg-red-600 text-white px-4 py-2.5 text-xs shadow-lg safe-top">
            <p className="font-semibold">{title}</p>
            <p className="mt-1 opacity-95 leading-snug">{body}</p>
            <a
                href={hintUrl}
                className="inline-block mt-2 underline font-bold break-all"
            >
                {hintUrl}
            </a>
            <p className="mt-1.5 opacity-80">Вне сети: <code className="bg-black/20 px-1 rounded">npm run dev:public</code> — loca.lt или Wi‑Fi :3443</p>
        </div>
    );
}
