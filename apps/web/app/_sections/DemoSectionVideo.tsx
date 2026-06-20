"use client";

import { useState } from "react";

import BaseVideo from "../_components/BaseVideo";
import { VideoMuteButton } from "@visuala/ui";

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
            <VideoMuteButton
                isMuted={isMuted}
                label="demo video"
                onClick={() => setIsMuted((value) => !value)}
                className="bottom-4 right-4 md:bottom-6 md:right-6"
            />
        </>
    );
}
