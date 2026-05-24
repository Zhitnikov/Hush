export class SecureCryptoRequiredError extends Error {
    constructor(message, hintUrl) {
        super(message);
        this.name = 'SecureCryptoRequiredError';
        this.hintUrl = hintUrl;
    }
}

export function isSecureCryptoAvailable() {
    if (typeof window === 'undefined') return false;
    return Boolean(window.isSecureContext && window.crypto?.subtle);
}


export function getDevHttpsUrl() {
    if (typeof window === 'undefined') return 'https://localhost:3443';
    const host = window.location.hostname || 'localhost';
    return `https://${host}:3443`;
}

export function getSecureContextMessage() {
    const httpsUrl = getDevHttpsUrl();
    if (typeof window !== 'undefined' && !window.isSecureContext) {
        return {
            title: 'Нужно безопасное соединение',
            body: `E2E-ключи и звонки работают только по HTTPS или на localhost. Откройте ${httpsUrl} (примите сертификат) или запустите npm run dev:public для ссылки из интернета.`,
            hintUrl: httpsUrl,
        };
    }
    if (typeof window !== 'undefined' && !window.crypto?.subtle) {
        return {
            title: 'Шифрование недоступно',
            body: 'Браузер не предоставляет Web Crypto. Используйте актуальный Chrome, Firefox или Safari по HTTPS.',
            hintUrl: httpsUrl,
        };
    }
    return null;
}

export function assertSecureCrypto() {
    const msg = getSecureContextMessage();
    if (msg) {
        throw new SecureCryptoRequiredError(msg.body, msg.hintUrl);
    }
}
