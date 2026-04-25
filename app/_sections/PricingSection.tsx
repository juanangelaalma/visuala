import React from "react";

const checkIcon = (color: string) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="mt-1 shrink-0"
  >
    <path
      d="M20 6L9 17L4 12"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const plans = [
  {
    id: "starter",
    name: "Starter",
    price: "Rp899k",
    credits: "250 credits",
    conversion: "100 images or 25 videos",
    bonus: "First month: 500 credits",
    features: [
      "Commercial use for all generated assets",
      "Live chat & email support",
      "Access to all styles",
    ],
    theme: "dark" as const,
  },
  {
    id: "professional",
    name: "Professional",
    price: "Rp3,9jt",
    credits: "1,000 credits",
    conversion: "400 images or 100 videos",
    bonus: "First month: 2,000 credits",
    features: [
      "Commercial use for all generated assets",
      "Priority support",
      "Custom styles to your brand (coming soon)",
    ],
    mostPopular: true,
    theme: "light" as const,
  },
  {
    id: "business",
    name: "Business",
    price: "Rp6,9jt",
    credits: "2,500 credits",
    conversion: "1,000 images or 250 videos",
    bonus: "First month: 5,000 credits",
    features: [
      "Commercial use for all generated assets",
      "Dedicated support",
      "Custom styles to your brand (coming soon)",
      "API Access (coming soon)",
    ],
    theme: "dark" as const,
  },
];

export default function PricingSection() {
  return (
    <section className="bg-[#161616] py-24 px-4 w-full overflow-hidden">
      <div className="mx-auto max-w-[1280px]">
        {/* Launch Offer Badge */}
        <div className="flex justify-center mb-10">
          <div className="bg-primary text-black font-bold text-base px-10 font-sans-secondary py-4 rounded-full flex items-center gap-2 uppercase tracking-[0.8px]">
            <span>🎉</span>
            Launch offer: Get 2× credits on your first month
          </div>
        </div>

        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-[48px] leading-[1.1] font-normal text-white mb-6 font-display">
            Price that scales with you
          </h2>
          <div className="space-y-1">
            <p className="text-[#bababa] text-[20px] leading-[1.8]">
              Premium Quality at Every Tier.
            </p>
            <div className="flex items-center justify-center gap-4 text-[#777] text-base leading-[2.2]">
              <span>4 images = 10 credits</span>
              <span>•</span>
              <span>1 video = 10 credits</span>
            </div>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 items-stretch">
          {plans.map((plan) => {
            const isLight = plan.theme === "light";

            return (
              <div
                key={plan.id}
                className={`relative rounded-[24px] p-[34px] flex flex-col h-full border-2 transition-all duration-300 ${
                  isLight
                    ? "bg-gradient-to-br from-white to-[#f9fafb] border-[#EFF31B] shadow-[0_25px_50px_-12px_rgba(239,243,27,0.2)]"
                    : "bg-gradient-to-br from-black/80 to-black border-white/20 backdrop-blur-[4px]"
                }`}
              >
                {plan.mostPopular && (
                  <div className="absolute -top-[12px] left-1/2 -translate-x-1/2 bg-[#EFF31B] text-black text-xs font-medium px-[12px] py-[4.5px] rounded-full whitespace-nowrap">
                    Most Popular
                  </div>
                )}

                <div className="mb-4">
                  <h3
                    className={`text-2xl mb-4 tracking-[-0.6px] ${
                      isLight ? "text-black" : "text-white"
                    }`}
                  >
                    {plan.name}
                  </h3>
                  <div
                    className={`text-[32px] font-medium font-display mb-6 leading-none tracking-[-0.8px] ${
                      isLight ? "text-black" : "text-white"
                    }`}
                  >
                    {plan.price}
                  </div>
                  <div className="space-y-2 mb-6">
                    <p
                      className={`text-[18px] font-medium tracking-[-0.27px] ${
                        isLight ? "text-black" : "text-white"
                      }`}
                    >
                      {plan.credits}
                    </p>
                    <p
                      className={`text-sm tracking-[-0.14px] ${
                        isLight ? "text-black/60" : "text-white/60"
                      }`}
                    >
                      {plan.conversion}
                    </p>
                  </div>

                  <div
                    className={`inline-flex items-center gap-2 px-[13px] py-[9px] rounded-full text-sm font-medium border ${
                      isLight
                        ? "bg-black/10 text-black/70 border-black/20"
                        : "bg-[#EFF31B]/20 text-[#EFF31B] border-[#EFF31B]/30"
                    }`}
                  >
                    <span className="text-base">🎁</span>
                    <span className="tracking-[-0.14px]">{plan.bonus}</span>
                  </div>
                </div>

                <div className="grow mt-8">
                  <ul className="space-y-3 mb-10">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        {checkIcon(isLight ? "black" : "#EFF31B")}
                        <span
                          className={`text-sm leading-5 tracking-[-0.14px] ${
                            isLight ? "text-black/80" : "text-white/60"
                          }`}
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  className={`w-full py-[14px] px-8 rounded-full text-base font-medium transition-all duration-200 active:scale-[0.98] shadow-lg ${
                    isLight
                      ? "bg-gradient-to-r from-black to-[#101828] text-white"
                      : "bg-gradient-to-r from-white to-[#f3f4f6] text-black"
                  }`}
                >
                  Start free trial
                </button>
              </div>
            );
          })}
        </div>

        {/* Enterprise Bottom Banner */}
        <div className="rounded-[24px] border-2 border-white/20 bg-gradient-to-r from-white/5 to-white/10 p-[34px] backdrop-blur-[4px]">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="text-center md:text-left">
              <h3 className="text-[28px] font-normal text-white mb-2 tracking-[-0.7px]">
                Need more? Let's talk about enterprise options
              </h3>
              <p className="text-white/70 text-[18px] tracking-[-0.27px] font-light">
                Get custom plans, dedicated support, and exclusive features tailored to your brand's creative needs.
              </p>
            </div>
            <button className="whitespace-nowrap px-[34px] py-[14px] rounded-full border-2 border-white text-white hover:bg-white/10 transition-colors font-semibold text-base uppercase tracking-[-0.16px]">
              Talk to sales
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
