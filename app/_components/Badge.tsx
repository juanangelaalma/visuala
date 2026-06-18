type BadgeProps = {
    children: React.ReactNode;
    className?: string;
};

export default function Badge({ children, className = "" }: BadgeProps) {
    return (
        <span className={`inline-flex items-center justify-center rounded-full ${className}`}>
            {children}
        </span>
    );
}
