interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'outline';
    children: React.ReactNode;
}

const Button = ({ variant = 'primary', children, className, ...props }: ButtonProps) => {
    const baseStyles = "rounded-full py-2 px-4 font-semibold transition-all duration-200 active:scale-95 cursor-pointer text-base leading-6";

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