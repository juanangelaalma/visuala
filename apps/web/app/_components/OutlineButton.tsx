import { Button } from "@visuala/ui";

type OutlineButtonProps = {
    children: React.ReactNode;
    className?: string;
    href?: string;
};

export function OutlineButton({ children, className = "", href }: OutlineButtonProps) {
    return (
        <Button href={href} variant="outline" className={`sm:block ${className}`}>
            {children}
        </Button>
    );
}
