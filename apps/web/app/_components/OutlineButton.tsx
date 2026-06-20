import { Button } from "@visuala/ui";

type OutlineButtonProps = {
    children: React.ReactNode;
    className?: string;
};

export function OutlineButton({ children, className = "" }: OutlineButtonProps) {
    return (
        <Button variant="outline" className={`sm:block ${className}`}>
            {children}
        </Button>
    );
}
