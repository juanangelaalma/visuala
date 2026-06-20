import Image from "next/image";
import logo from "./assets/logo.svg";
import shortLogo from "./assets/short-logo.svg";

interface BrandProps {
    theme?: "light" | "dark";
    className?: string;
    variant?: "full" | "mark" | "responsive";
}

export default function Brand({ theme = "light", className = "", variant = "responsive" }: BrandProps) {
    const filterClass = theme === "dark" ? "invert" : "";

    if (variant === "mark") {
        return (
            <div className={`flex items-center ${className}`}>
                <Image
                    src={shortLogo}
                    alt="Visuala"
                    width={36}
                    height={36}
                    className={`transition-transform ${filterClass}`}
                />
            </div>
        );
    }

    if (variant === "full") {
        return (
            <div className={`flex items-center ${className}`}>
                <Image
                    src={logo}
                    alt="Visuala"
                    width={200}
                    height={40}
                    className={`transition-transform ${filterClass}`}
                />
            </div>
        );
    }

    return (
        <div className={`flex items-center ${className}`}>
            <Image
                src={shortLogo}
                alt="Visuala"
                width={36}
                height={36}
                className={`block transition-transform sm:hidden ${filterClass}`}
            />
            <Image
                src={logo}
                alt="Visuala"
                width={200}
                height={40}
                className={`hidden transition-transform sm:block ${filterClass}`}
            />
        </div>
    );
}