"use client";

import { useState } from "react";

const heroVideos = [
    "/videos/heroes/car_mountain.mp4",
    "/videos/heroes/drone.mp4",
    "/videos/heroes/hiker.mp4",
    "/videos/heroes/women.mp4",
];

export default function HeroBackgroundVideo() {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isBlinking, setIsBlinking] = useState(false);
    const activeSrc = heroVideos[activeIndex];
    const nextSrc = heroVideos[(activeIndex + 1) % heroVideos.length];

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
            <video
                key={activeSrc}
                className="absolute inset-0 -z-20 h-full w-full object-cover"
                src={activeSrc}
                autoPlay
                muted
                playsInline
                preload="metadata"
                aria-hidden="true"
                onEnded={showNextVideo}
            />
            <video src={nextSrc} preload="auto" muted playsInline className="hidden" aria-hidden="true" />
            <div
                aria-hidden="true"
                className={`absolute inset-0 -z-[15] bg-black transition-opacity duration-500 ease-in-out ${isBlinking ? "opacity-100" : "opacity-0"}`}
            />
        </>
    );
}
