import Image from "next/image";
import GiftIcon from "../__assets/gift.svg"

export default function PromoBar() {
    return (
        <div
            className="flex items-center gap-3 w-auto absolute bottom-12 border border-white text-white p-2 z-10 rounded-[10px] backdrop-blur-md"
        >
            <Image src={GiftIcon} alt="Gift" width={16} height={16} />
            <p className="text-[16px] font-sans-secondary text-white tracking-wide font-light">
                Sign up to 2x your first-month credits
            </p>
        </div>
    )
}