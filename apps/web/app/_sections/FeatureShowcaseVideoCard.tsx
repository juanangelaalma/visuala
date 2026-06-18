"use client";

import { useEffect, useRef, useState } from "react";

import BaseVideo from "../_components/BaseVideo";
import VideoMuteButton from "../_components/VideoMuteButton";

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
                if (!entry.isIntersecting) setIsMuted(true);
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
            <VideoMuteButton
                isMuted={isMuted}
                label={label}
                onClick={() => setIsMuted((value) => !value)}
                className="bottom-4 right-4 md:bottom-5 md:right-5"
            />
        </div>
    );
}
