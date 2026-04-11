import Button from "./Button";

interface StartFreeTrialButtonProps {
    className?: string;
}

export default function StartFreeTrialButton({ className }: StartFreeTrialButtonProps) {
    return (
        <Button className={`px-3 py-1.5 text-sm sm:text-base sm:px-4 sm:py-2 whitespace-nowrap ${className || ""}`}>
            Start free trial
        </Button>
    )
}