import Image from "next/image";
import GiftIcon from "../__assets/gift.svg"

export default function PromoBar() {
    return (
        <div
            className="flex items-center gap-3 w-auto absolute bottom-12 border border-white text-white p-2 z-10 rounded-[10px] backdrop-blur-md"
        >
            <Image src={GiftIcon} alt="Gift" width={24} height={24} />
            <p className="text-[14px] font-light text-white tracking-wide">
                Sign up to 2x your first-month credits
            </p>
        </div>
    )
}