"use client";

type VideoMuteButtonProps = {
    isMuted: boolean;
    label: string;
    className?: string;
    onClick: () => void;
};

function MutedIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="scale-75 opacity-90 md:scale-100">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
    );
}

function UnmutedIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="scale-75 opacity-90 md:scale-100">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
    );
}

export default function VideoMuteButton({ isMuted, label, className = "", onClick }: VideoMuteButtonProps) {
    return (
        <button
            type="button"
            aria-label={`${isMuted ? "Unmute" : "Mute"} ${label}`}
            aria-pressed={!isMuted}
            onClick={onClick}
            className={`absolute z-20 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70 md:h-10 md:w-10 ${className}`}
        >
            {isMuted ? <MutedIcon /> : <UnmutedIcon />}
        </button>
    );
}
