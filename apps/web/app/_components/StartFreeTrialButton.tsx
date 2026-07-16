import { Button } from "@visuala/ui";
import { getAppUrl } from "../app-url";

type StartFreeTrialButtonProps = {
    className?: string;
};

export default function StartFreeTrialButton({ className = "" }: StartFreeTrialButtonProps) {
    return (
        <Button href={getAppUrl("/register")} className={`font-sans-secondary whitespace-nowrap ${className}`}>
            Start free trial
        </Button>
    );
}
