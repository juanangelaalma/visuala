import Image from "next/image";
import img1 from "../__assets/demo/1.webp";
import img2 from "../__assets/demo/2.webp";
import img3 from "../__assets/demo/3.webp";

export default function MoreDemoSection() {
    const images = [img1, img2, img3];

    return (
        <section className="bg-black pb-[80px] pl-[16px] lg:p-[80px] w-full overflow-hidden">
            <div className="flex overflow-x-auto pr-[16px] md:pr-[0px] gap-4 md:gap-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-x snap-mandatory base-container">
                {images.map((src, index) => (
                    <div
                        key={index}
                        className="relative flex-none w-[75vw] sm:w-[50vw] md:w-[35vw] lg:w-[450px] lg:h-[800px] aspect-[9/16] rounded-2xl overflow-hidden snap-center"
                    >
                        <Image
                            src={src}
                            alt={`Demo image ${index + 1}`}
                            fill
                            className="object-cover"
                        />
                    </div>
                ))}
            </div>
        </section>
    );
}
