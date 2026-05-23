import Button from "./Button";

interface OutlineButtonProps {
    children: React.ReactNode;
    className?: string;
}

export function OutlineButton({ children, className }: OutlineButtonProps) {
    return (
        <Button variant="outline" className={`sm:block border-[1.5px] ${className || ""}`}>
            {children}
        </Button>
    )
}