"use client";

import { useEffect, useRef, useState } from "react";

type MoreDemoVideoTileProps = {
    src: string;
    label: string;
};

export default function MoreDemoVideoTile({ src, label }: MoreDemoVideoTileProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [shouldLoad, setShouldLoad] = useState(false);

    useEffect(() => {
        const video = videoRef.current;

        if (!video) {
            return;
        }

        const loadObserver = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setShouldLoad(true);
                }
            },
            {
                rootMargin: "480px 960px",
                threshold: 0,
            }
        );

        loadObserver.observe(video);

        return () => loadObserver.disconnect();
    }, []);

    useEffect(() => {
        const video = videoRef.current;

        if (!video || !shouldLoad) {
            return;
        }

        video.load();

        const playObserver = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    void video.play().catch(() => {
                        // Browser autoplay settings can block playback; the tile remains ready.
                    });
                    return;
                }

                video.pause();
            },
            { threshold: 0.35 }
        );

        playObserver.observe(video);

        return () => playObserver.disconnect();
    }, [shouldLoad]);

    return (
        <video
            ref={videoRef}
            src={shouldLoad ? src : undefined}
            className="h-full w-full object-cover scale-[1.30]"
            muted
            loop
            playsInline
            preload={shouldLoad ? "metadata" : "none"}
            aria-label={label}
        />
    );
}
