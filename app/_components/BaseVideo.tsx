"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type VideoHTMLAttributes,
} from "react";

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
    const [videoNode, setVideoNode] = useState<HTMLVideoElement | null>(null);
    const videoRef = useCallback((node: HTMLVideoElement | null) => {
        setVideoNode(node);
    }, []);

    const [shouldLoad, setShouldLoad] = useState(!lazy);
    const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

    const isHlsSource = useMemo(() => src.endsWith(".m3u8"), [src]);
    const isReady = loadedSrc === src;

    useEffect(() => {
        const video = videoNode;

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
    }, [lazy, loadRootMargin, videoNode]);

    useEffect(() => {
        const video = videoNode;

        if (!video || !shouldLoad) {
            return;
        }

        // If the source is an HLS manifest, we let hls.js handle attaching media and loading.
        if (!isHlsSource) {
            video.load();
        }

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
    }, [isHlsSource, playThreshold, shouldLoad, videoNode]);

    useEffect(() => {
        const video = videoNode;

        if (!video || !shouldLoad || !isHlsSource) {
            return;
        }

        let isCancelled = false;
        let cleanup: (() => void) | undefined;

        void (async () => {
            const mod = await import("hls.js");
            const Hls = mod.default;

            if (isCancelled) return;

            if (!Hls.isSupported()) {
                // Safari/iOS can play HLS natively.
                if (video.canPlayType("application/vnd.apple.mpegurl")) {
                    video.src = src;
                    video.load();
                }
                return;
            }

            const hls = new Hls({ startLevel: -1 });
            hls.loadSource(src);
            hls.attachMedia(video);

            cleanup = () => hls.destroy();
        })();

        return () => {
            isCancelled = true;
            cleanup?.();
        };
    }, [isHlsSource, shouldLoad, src, videoNode]);

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
                src={shouldLoad && !isHlsSource ? src : undefined}
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
