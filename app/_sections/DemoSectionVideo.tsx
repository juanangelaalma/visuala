"use client";

import { useState } from "react";

import BaseVideo from "../_components/BaseVideo";

type DemoSectionVideoProps = {
    src: string;
    fallbackSrc: string;
};

export default function DemoSectionVideo({ src, fallbackSrc }: DemoSectionVideoProps) {
    const [isMuted, setIsMuted] = useState(true);

    return (
        <>
            <BaseVideo
                src={src}
                fallbackSrc={fallbackSrc}
                muted={isMuted}
                wrapperClassName="absolute inset-0 h-full w-full"
                className="absolute inset-0 h-full w-full object-cover"
                ariaLabel="Demo visual"
            />

            <button
                type="button"
                aria-label={isMuted ? "Unmute demo video" : "Mute demo video"}
                aria-pressed={!isMuted}
                onClick={() => setIsMuted((value) => !value)}
                className="absolute bottom-4 right-4 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70 md:bottom-6 md:right-6 md:h-10 md:w-10"
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
        </>
    );
}
