import React, { useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import clsx from 'clsx';


export default function VideoCirclePlayer({ src, className }) {
    const videoRef = useRef(null);
    const [playing, setPlaying] = useState(false);

    const stopAndReset = () => {
        const el = videoRef.current;
        if (!el) return;
        el.pause();
        el.currentTime = 0;
        el.muted = true;
        setPlaying(false);
    };

    const toggle = () => {
        const el = videoRef.current;
        if (!el) return;
        if (playing) {
            stopAndReset();
            return;
        }
        el.muted = false;
        el.play().then(() => setPlaying(true)).catch(() => {});
    };

    return (
        <button
            type="button"
            onClick={toggle}
            className={clsx(
                'relative w-[240px] h-[240px] rounded-full overflow-hidden border-4 border-blue-500/20 shadow-lg bg-black focus:outline-none focus:ring-2 focus:ring-[var(--accent)]',
                className
            )}
            aria-label={playing ? 'Пауза' : 'Воспроизвести видеокружок'}
        >
            <video
                ref={videoRef}
                src={src}
                playsInline
                muted
                className="w-full h-full object-cover rounded-full"
                onEnded={stopAndReset}
            />
            {!playing && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none">
                    <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-md">
                        <Play size={22} className="text-[var(--accent)] ml-0.5" fill="currentColor" />
                    </span>
                </span>
            )}
            {playing && (
                <span className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center pointer-events-none">
                    <Pause size={14} className="text-white" />
                </span>
            )}
        </button>
    );
}
