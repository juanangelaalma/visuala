import React from 'react';

export default function ReimagineBanner() {
  return (
    <div className="relative z-10 flex items-center justify-center my-10 w-full">
      {/* Banner Putih Miring */}
      <div
        className="bg-white w-full md:w-auto px-6 py-6 md:py-2.5 shadow-2xl origin-center"
        style={{ transform: 'rotate(-2deg)' }}
      >
        <div
          className="relative flex items-center justify-center overflow-hidden h-9 md:h-18"
          style={{ transform: 'rotate(2deg)' }}
        >
          <div className="reimagine-banner__words">
            <span className="reimagine-banner__word text-4xl md:text-6xl leading-none font-sans font-bold md:leading-18 text-black tracking-tight uppercase m-0 whitespace-nowrap">
              REIMAGINE
            </span>
            <span className="reimagine-banner__word text-4xl md:text-6xl leading-none font-sans font-bold md:leading-18 text-black tracking-tight uppercase m-0 whitespace-nowrap">
              YOUR WORK
            </span>
            <span className="reimagine-banner__word text-4xl md:text-6xl leading-none font-sans font-bold md:leading-18 text-black tracking-tight uppercase m-0 whitespace-nowrap">
              FINISHED
            </span>
            <span className="reimagine-banner__word text-4xl md:text-6xl leading-none font-sans font-bold md:leading-18 text-black tracking-tight uppercase m-0 whitespace-nowrap">
              IN MINUTES
            </span>
            <span className="reimagine-banner__word text-4xl md:text-6xl leading-none font-sans font-bold md:leading-18 text-black tracking-tight uppercase m-0 whitespace-nowrap">
              REIMAGINE
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}