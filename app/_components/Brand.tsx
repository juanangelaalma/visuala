import Image from "next/image";
import logo from "@/public/logo.svg";

export default function Brand() {
    return (
        <Image
            src={logo}
            alt="Description"
            width={175}
            height={36}
        />
    );
}