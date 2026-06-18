import Image from "next/image";
import logo from "@/public/logo.svg";
import shortLogo from "@/public/short-logo.svg";

interface BrandProps {
    theme?: 'light' | 'dark';
}

export default function Brand({ theme = 'light' }: BrandProps) {
    const filterClass = theme === 'dark' ? 'invert' : '';

    return (
        <div className="flex items-center group">
            <Image
                src={shortLogo}
                alt="Visuala"
                width={36}
                height={36}
                className={`block sm:hidden transition-transform ${filterClass}`}
            />
            <Image
                src={logo}
                alt="Visuala"
                width={200}
                height={40}
                className={`hidden sm:block transition-transform ${filterClass}`}
            />
        </div>
    );
}