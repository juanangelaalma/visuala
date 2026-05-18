"use client";

import { useEffect, useRef } from "react";

type DemoSectionVideoProps = {
    src: string;
};

export default function DemoSectionVideo({ src }: DemoSectionVideoProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;

        if (!video) {
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    void video.play().catch(() => {
                        // Autoplay can be blocked by browser settings; keep the media visible.
                    });
                    return;
                }

                video.pause();
            },
            { threshold: 0.35 }
        );

        observer.observe(video);

        return () => observer.disconnect();
    }, []);

    return (
        <video
            ref={videoRef}
            src={src}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="Demo visual"
        />
    );
}
