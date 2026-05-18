import React from 'react';

export default function ReimagineBanner() {
  return (
    <div className="relative z-10 flex items-center justify-center my-[40px] w-full">
      {/* Banner Putih Miring */}
      <div
        className="bg-white w-full md:w-auto px-6 py-[24px] md:py-[10px] shadow-2xl origin-center"
        style={{ transform: 'rotate(-2deg)' }}
      >
        <div
          className="relative flex items-center justify-center overflow-hidden h-[36px] md:h-[70px]"
          style={{ transform: 'rotate(2deg)' }}
        >
          <div className="reimagine-banner__words">
            <span className="reimagine-banner__word text-4xl md:text-6xl leading-none font-sans font-bold md:leading-[70px] text-black tracking-tight uppercase m-0 whitespace-nowrap">
              REIMAGINE
            </span>
            <span className="reimagine-banner__word text-4xl md:text-6xl leading-none font-sans font-bold md:leading-[70px] text-black tracking-tight uppercase m-0 whitespace-nowrap">
              YOUR WORK
            </span>
            <span className="reimagine-banner__word text-4xl md:text-6xl leading-none font-sans font-bold md:leading-[70px] text-black tracking-tight uppercase m-0 whitespace-nowrap">
              FINISHED
            </span>
            <span className="reimagine-banner__word text-4xl md:text-6xl leading-none font-sans font-bold md:leading-[70px] text-black tracking-tight uppercase m-0 whitespace-nowrap">
              IN MINUTES
            </span>
            <span className="reimagine-banner__word text-4xl md:text-6xl leading-none font-sans font-bold md:leading-[70px] text-black tracking-tight uppercase m-0 whitespace-nowrap">
              REIMAGINE
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}