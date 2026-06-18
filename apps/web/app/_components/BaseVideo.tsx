"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type VideoHTMLAttributes,
} from "react";

type BaseVideoProps = Omit<
    VideoHTMLAttributes<HTMLVideoElement>,
    "aria-label" | "className" | "preload" | "src"
> & {
    src: string;
    fallbackSrc?: string;
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
    fallbackSrc,
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
    const videoElementRef = useRef<HTMLVideoElement | null>(null);
    const [videoRefVersion, setVideoRefVersion] = useState(0);
    const videoRef = useCallback((node: HTMLVideoElement | null) => {
        videoElementRef.current = node;
        setVideoRefVersion((version) => version + 1);
    }, []);

    const [shouldLoad, setShouldLoad] = useState(!lazy);
    const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
    const shouldPlayRef = useRef(false);

    const isHlsSource = useMemo(() => src.endsWith(".m3u8"), [src]);
    const isReady = loadedSrc === src;

    useEffect(() => {
        const video = videoElementRef.current;

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
    }, [lazy, loadRootMargin, videoRefVersion]);

    useEffect(() => {
        const video = videoElementRef.current;

        if (!video || !shouldLoad) {
            return;
        }

        if (!isHlsSource) {
            video.load();
        }

        const playObserver = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    shouldPlayRef.current = true;
                    void video.play().catch(() => undefined);
                    return;
                }

                shouldPlayRef.current = false;
                video.pause();
            },
            { threshold: playThreshold }
        );

        playObserver.observe(video);

        return () => playObserver.disconnect();
    }, [isHlsSource, playThreshold, shouldLoad, videoRefVersion]);

    useEffect(() => {
        const video = videoElementRef.current;

        if (!video || !shouldLoad || !isHlsSource) {
            return;
        }

        let isCancelled = false;
        let cleanup: (() => void) | undefined;

        void (async () => {
            const mod = await import("hls.js");
            const Hls = mod.default;

            if (isCancelled) return;

            const applyFallback = () => {
                if (fallbackSrc) {
                    video.src = fallbackSrc;
                    video.load();
                    if (shouldPlayRef.current) {
                        void video.play().catch(() => undefined);
                    }
                }
            };

            const playIfVisible = () => {
                if (!shouldPlayRef.current) return;

                void video.play().catch(() => undefined);
            };

            if (!Hls.isSupported()) {
                if (video.canPlayType("application/vnd.apple.mpegurl")) {
                    video.src = src;
                    video.load();
                    video.addEventListener("loadedmetadata", playIfVisible, { once: true });
                    cleanup = () => {
                        video.removeEventListener("loadedmetadata", playIfVisible);
                    };
                } else {
                    applyFallback();
                }
                return;
            }

            const hls = new Hls({ startLevel: -1 });

            const onError = (_event: unknown, data: { fatal?: boolean }) => {
                if (!data?.fatal) return;

                hls.destroy();
                applyFallback();
            };

            hls.on(Hls.Events.ERROR, onError);
            hls.on(Hls.Events.MANIFEST_PARSED, playIfVisible);
            hls.loadSource(src);
            hls.attachMedia(video);

            cleanup = () => {
                hls.off(Hls.Events.ERROR, onError);
                hls.off(Hls.Events.MANIFEST_PARSED, playIfVisible);
                hls.destroy();
            };
        })();

        return () => {
            isCancelled = true;
            cleanup?.();
        };
    }, [fallbackSrc, isHlsSource, shouldLoad, src, videoRefVersion]);

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
