import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause } from 'lucide-react';

export default function VoicePlayer({ url, isMe }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const audioRef = useRef(null);
    const [waveform, setWaveform] = useState([]);

    useEffect(() => {
        const audio = new Audio(url);
        audioRef.current = audio;

        const updateProgress = () => setProgress((audio.currentTime / (audio.duration || 1)) * 100);

        const onLoadedMetadata = () => {
            if (audio.duration && audio.duration !== Infinity) {
                setDuration(audio.duration);
            }
        };

        const onCanPlayThrough = () => {
            if (audio.duration && audio.duration !== Infinity) {
                setDuration(audio.duration);
            }
        };

        const durationInterval = setInterval(() => {
            if (audio.duration && audio.duration !== Infinity) {
                setDuration(audio.duration);
                clearInterval(durationInterval);
            }
        }, 500);

        const onEnded = () => { setIsPlaying(false); setProgress(0); };

        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('canplaythrough', onCanPlayThrough);
        audio.addEventListener('ended', onEnded);

        const bars = Array.from({ length: 45 }, () => Math.random() * 80 + 20);
        setWaveform(bars);

        return () => {
            clearInterval(durationInterval);
            audio.pause();
            audio.removeEventListener('timeupdate', updateProgress);
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.removeEventListener('canplaythrough', onCanPlayThrough);
            audio.removeEventListener('ended', onEnded);
        };
    }, [url]);

    useEffect(() => {
        if (audioRef.current) audioRef.current.playbackRate = playbackRate;
    }, [playbackRate]);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) audioRef.current.pause();
        else audioRef.current.play();
        setIsPlaying(!isPlaying);
    };

    const toggleSpeed = () => {
        const rates = [1, 1.5, 2];
        const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
        setPlaybackRate(next);
    };

    const handleSeek = (e) => {
        if (!audioRef.current || !audioRef.current.duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = x / rect.width;
        audioRef.current.currentTime = pct * audioRef.current.duration;
    };

    const formatTime = (s) => {
        if (!s || isNaN(s)) return '0:00';
        const min = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    };

    return (
        <div className="flex items-center gap-3 py-1 px-1 min-w-[240px] select-none">
            <div className="flex items-center gap-2">
                <button
                    onClick={togglePlay}
                    className="w-10 h-10 rounded-full flex items-center justify-center transition-all bg-blue-500 text-white hover:bg-blue-600 shadow-sm"
                >
                    {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                </button>
                <button
                    onClick={toggleSpeed}
                    className="w-10 h-6 bg-blue-50 text-blue-500 rounded-full text-[10px] font-black flex items-center justify-center hover:bg-blue-100 transition-colors border border-blue-100"
                >
                    {playbackRate}x
                </button>
            </div>

            <div className="flex-1 flex flex-col gap-1">
                <div
                    className="h-8 flex items-end gap-[2px] cursor-pointer"
                    onClick={handleSeek}
                >
                    {waveform.map((height, i) => {
                        const barProgress = (i / waveform.length) * 100;
                        const isPlayed = progress > barProgress;
                        return (
                            <div
                                key={i}
                                style={{ height: `${height}%` }}
                                className={`w-[2.5px] rounded-full transition-colors ${isPlayed
                                    ? 'bg-blue-600'
                                    : (isMe ? 'bg-blue-200' : 'bg-gray-200')
                                    }`}
                            />
                        );
                    })}
                </div>
                <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                    <span>{formatTime(audioRef.current?.currentTime)} / {formatTime(duration)}</span>
                    <span className="text-[9px] opacity-70">Voice</span>
                </div>
            </div>
        </div>
    );
}
