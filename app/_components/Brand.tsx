import Image from "next/image";
import logo from "@/public/logo.svg";
import shortLogo from "@/public/short-logo.svg";

export default function Brand() {
    return (
        <>
            {/* Short logo: mobile only */}
            <Image
                src={shortLogo}
                alt="Visuala"
                width={36}
                height={36}
                className="block sm:hidden"
            />
            {/* Full logo: sm and above */}
            <Image
                src={logo}
                alt="Visuala"
                width={175}
                height={36}
                className="hidden sm:block"
            />
        </>
    );
}