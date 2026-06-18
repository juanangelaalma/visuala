import ImageTrail from "@/app/_components/ImageTrail/ImageTrail";

export default function ValuePropSection() {
  return (
    <section className="bg-primary w-full py-24 md:py-32 flex flex-col justify-center items-center text-black px-4 relative overflow-hidden">
      <div className="absolute inset-0 z-30">
        <ImageTrail
          items={[
            'https://picsum.photos/id/287/300/300',
            'https://picsum.photos/id/1001/300/300',
            'https://picsum.photos/id/1025/300/300',
            'https://picsum.photos/id/1026/300/300',
            'https://picsum.photos/id/1027/300/300',
            'https://picsum.photos/id/1028/300/300',
            'https://picsum.photos/id/1029/300/300',
            'https://picsum.photos/id/1030/300/300',
          ]}
          variant={1}
        />
      </div>
      <div className="relative z-20 flex flex-col justify-center items-center">
        <h2 className="text-body-2xl font-display md:text-section-sm font-normal mb-12 md:mb-16 text-center tracking-wide pointer-events-none">
          Generate stunning product photography and video
        </h2>
        <p className="text-body-xl font-sans-secondary font-normal md:text-section-sm leading-snug text-center pointer-events-none">
          simply upload a product photo. Our curated<br className="hidden md:block" />
          AI templates deliver cinematic shots<br className="hidden md:block" />
          Without the production hassle.
        </p>
      </div>
    </section>
  );
}
