import Button from "./Button";

interface StartFreeTrialButtonProps {
    className?: string;
}

export default function StartFreeTrialButton({ className }: StartFreeTrialButtonProps) {
    return (
        <Button className={`px-6 py-3 text-[16px] font-sans-secondary whitespace-nowrap ${className || ""}`}>
            Start free trial
        </Button>
    )
}