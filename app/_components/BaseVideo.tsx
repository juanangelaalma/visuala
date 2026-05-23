"use client";

import { useEffect, useRef, useState, type VideoHTMLAttributes } from "react";

type BaseVideoProps = Omit<
    VideoHTMLAttributes<HTMLVideoElement>,
    "aria-label" | "className" | "preload" | "src"
> & {
    src: string;
    ariaLabel: string;
    className?: string;
    lazy?: boolean;
    loadRootMargin?: string;
    playThreshold?: number;
    preload?: HTMLVideoElement["preload"];
    showSkeleton?: boolean;
    skeletonClassName?: string;
    wrapperClassName?: string;
};

export default function BaseVideo({
    src,
    ariaLabel,
    className,
    lazy = false,
    loadRootMargin = "480px 960px",
    playThreshold = 0.35,
    preload = "metadata",
    showSkeleton = true,
    skeletonClassName = "skeleton-shimmer pointer-events-none absolute inset-0 z-10",
    wrapperClassName = "relative block h-full w-full overflow-hidden",
    ...videoProps
}: BaseVideoProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [shouldLoad, setShouldLoad] = useState(!lazy);
    const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
    const isReady = loadedSrc === src;

    useEffect(() => {
        const video = videoRef.current;

        if (!video || !lazy) {
            return;
        }

        const loadObserver = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setShouldLoad(true);
                }
            },
            {
                rootMargin: loadRootMargin,
                threshold: 0,
            }
        );

        loadObserver.observe(video);

        return () => loadObserver.disconnect();
    }, [lazy, loadRootMargin]);

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
                        // Browser autoplay settings can block playback; the video remains ready.
                    });
                    return;
                }

                video.pause();
            },
            { threshold: playThreshold }
        );

        playObserver.observe(video);

        return () => playObserver.disconnect();
    }, [playThreshold, shouldLoad]);

    return (
        <span className={wrapperClassName}>
            {showSkeleton ? (
                <span
                    aria-hidden="true"
                    className={`${skeletonClassName} transition-opacity duration-300 ${isReady ? "opacity-0" : "opacity-100"}`}
                />
            ) : null}
            <video
                ref={videoRef}
                src={shouldLoad ? src : undefined}
                className={className}
                muted
                loop
                playsInline
                preload={shouldLoad ? preload : "none"}
                aria-label={ariaLabel}
                {...videoProps}
                onLoadedData={(event) => {
                    setLoadedSrc(src);
                    videoProps.onLoadedData?.(event);
                }}
                onCanPlay={(event) => {
                    setLoadedSrc(src);
                    videoProps.onCanPlay?.(event);
                }}
            />
        </span>
    );
}
