"use client";

import { useEffect, useRef, useState } from "react";

import BaseVideo from "../_components/BaseVideo";

type FeatureShowcaseVideoCardProps = {
    src: string;
    label: string;
};

export default function FeatureShowcaseVideoCard({ src, label }: FeatureShowcaseVideoCardProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const [isMuted, setIsMuted] = useState(true);

    useEffect(() => {
        const card = cardRef.current;

        if (!card) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) {
                    setIsMuted(true);
                }
            },
            { threshold: 0.01 }
        );

        observer.observe(card);

        return () => observer.disconnect();
    }, []);

    return (
        <div ref={cardRef} className="absolute inset-0">
            <BaseVideo
                src={src.replace(/\.mp4$/, "/index.m3u8")}
                ariaLabel={label}
                fallbackSrc={src}
                muted={isMuted}
                wrapperClassName="absolute inset-0 h-full w-full"
                className="absolute inset-0 h-full w-full object-cover"
                lazy
            />

            <button
                type="button"
                aria-label={isMuted ? `Unmute ${label}` : `Mute ${label}`}
                aria-pressed={!isMuted}
                onClick={() => setIsMuted((value) => !value)}
                className="absolute bottom-4 right-4 z-20 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70 md:bottom-5 md:right-5 md:h-10 md:w-10"
            >
                {isMuted ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="scale-75 opacity-90 md:scale-100">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <line x1="23" y1="9" x2="17" y2="15" />
                        <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="scale-75 opacity-90 md:scale-100">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                )}
            </button>
        </div>
    );
}
