import Image from "next/image";
import GiftIcon from "../__assets/gift.svg";

export default function PromoBar() {
    return (
        <div className="absolute bottom-12 z-10 flex w-auto items-center gap-3 rounded-lg border border-white p-2 text-white backdrop-blur-md">
            <Image src={GiftIcon} alt="Gift" width={16} height={16} />
            <p className="font-sans-secondary text-base font-light tracking-wide text-white">
                Sign up to 2x your first-month credits
            </p>
        </div>
    );
}
