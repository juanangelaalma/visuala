interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'outline' | 'custom';
    children: React.ReactNode;
}

const Button = ({ variant = 'primary', children, className, ...props }: ButtonProps) => {
    if (variant === 'custom') {
        return (
            <button className={className} {...props}>
                {children}
            </button>
        );
    }

    const baseStyles = "rounded-full py-2 px-4 font-semibold transition-all duration-200 cursor-pointer text-base leading-6";

    const variants = {
        primary: "bg-primary text-black hover:bg-primary-dark",
        outline: "bg-transparent border border-white text-white hover:bg-white/10 px-10",
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${className || ''}`}
            {...props}
        >
            {children}
        </button>
    );
};

export default Button;