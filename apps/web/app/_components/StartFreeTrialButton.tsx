import Button from "./Button";

type StartFreeTrialButtonProps = {
    className?: string;
};

export default function StartFreeTrialButton({ className = "" }: StartFreeTrialButtonProps) {
    return (
        <Button className={`font-sans-secondary whitespace-nowrap ${className}`}>
            Start free trial
        </Button>
    );
}
