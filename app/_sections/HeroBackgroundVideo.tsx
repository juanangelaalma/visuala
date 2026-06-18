"use client";

import { useState } from "react";

import BaseVideo from "../_components/BaseVideo";

const heroVideos = [
    "/videos/heroes/car_mountain.mp4",
    "/videos/heroes/drone.mp4",
    "/videos/heroes/hiker.mp4",
    "/videos/heroes/women.mp4",
];

export default function HeroBackgroundVideo() {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isBlinking, setIsBlinking] = useState(false);
    const activeFallbackSrc = heroVideos[activeIndex];
    const nextFallbackSrc = heroVideos[(activeIndex + 1) % heroVideos.length];

    const activeSrc = activeFallbackSrc.replace(/\.mp4$/, "/index.m3u8");
    const nextSrc = nextFallbackSrc.replace(/\.mp4$/, "/index.m3u8");

    function showNextVideo() {
        setIsBlinking(true);

        window.setTimeout(() => {
            setActiveIndex((index) => (index + 1) % heroVideos.length);
        }, 300);

        window.setTimeout(() => {
            setIsBlinking(false);
        }, 700);
    }

    return (
        <>
            <BaseVideo
                key={activeSrc}
                className="absolute inset-0 -z-20 h-full w-full object-cover"
                wrapperClassName="absolute inset-0 -z-20 h-full w-full"
                src={activeSrc}
                fallbackSrc={activeFallbackSrc}
                autoPlay
                muted
                playsInline
                preload="metadata"
                ariaLabel="Hero background video"
                loop={false}
                onEnded={showNextVideo}
            />
            <BaseVideo
                src={nextSrc}
                fallbackSrc={nextFallbackSrc}
                preload="auto"
                muted
                playsInline
                ariaLabel="Next hero background video"
                className="hidden"
                wrapperClassName="hidden"
            />
            <div
                aria-hidden="true"
                className={`-z-video-transition absolute inset-0 bg-black transition-opacity duration-500 ease-in-out ${isBlinking ? "opacity-100" : "opacity-0"}`}
            />
        </>
    );
}
