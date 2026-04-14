import Image from "next/image";
import img1 from "../__assets/demo/1.webp";
import img2 from "../__assets/demo/2.webp";
import img3 from "../__assets/demo/3.webp";

const categories = [
    { title: "GENERAL", image: "/demo.webp" },
    { title: "UGC", image: "/hero.webp" },
    { title: "BEAUTY", image: img1 },
    { title: "FASHION", image: img2 },
    { title: "FOOD", image: img3 },
];

export default function CategoriesSection() {
    return (
        <section className="bg-primary py-16 md:py-24 px-4 md:px-8 w-full flex flex-col gap-10">
            <div className="base-container w-full mx-auto flex flex-col gap-10">
                <h2 className="text-4xl md:text-5xl font-medium text-black leading-tight tracking-tight">
                    What do you want<br />to create?
                </h2>

                <div className="grid grid-flow-col auto-cols-[70%] sm:auto-cols-[45%] md:auto-cols-[30%] lg:grid-flow-row lg:grid-cols-5 gap-4 md:gap-[7.5px] w-full pb-4 overflow-x-auto lg:overflow-x-visible snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {categories.map((cat, index) => (
                        <div
                            key={index}
                            className="relative w-full aspect-[259/459] snap-center rounded-[12px] overflow-hidden group hover:shadow-lg transition-shadow cursor-pointer"
                        >
                            <Image
                                src={cat.image}
                                alt={cat.title}
                                fill
                                className="object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors duration-500" />

                            <div className="absolute inset-0 flex items-center justify-center p-4">
                                <h3 className="text-white text-xl md:text-2xl font-normal tracking-wider uppercase text-center drop-shadow-md">
                                    {cat.title}
                                </h3>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
