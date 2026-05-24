
export default {
    content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
            },
            colors: {
                primary: '#2563eb',
                secondary: '#1e293b',
                tertiary: '#f8fafc',
                surface: '#dcfce7',
                surfaceOther: '#ffffff',
                border: '#e2e8f0',
                text: '#0f172a',
                muted: '#64748b'
            }
        },
    },
    plugins: [],
}