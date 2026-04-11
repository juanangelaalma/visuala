export default function ReimagineBanner() {
  return (
    <div className="relative z-10 flex items-center justify-center my-[40px] w-full">
      {/* Banner Putih Miring */}
      <div
        className="bg-white w-full md:w-auto px-6 py-[24px] md:py-[10px] shadow-2xl origin-center"
        style={{ transform: 'rotate(-2deg)' }}
      >
        {/* Teks */}
        <h1 className="text-4xl md:text-6xl leading-none md:leading-[70px] font-extrabold text-black tracking-tight uppercase m-0"
          style={{ transform: 'rotate(2deg)' }}
        >
          REIMAGINE
        </h1>
      </div>
    </div>
  );
}