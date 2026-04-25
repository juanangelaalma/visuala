
const defaultCheck = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="mt-0.5 shrink-0"
  >
    <path
      d="M20 6L9 17L4 12"
      stroke="#E5FF00"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const darkCheck = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="mt-0.5 shrink-0"
  >
    <path
      d="M20 6L9 17L4 12"
      stroke="#111111"
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
    bonus: "🎁 First month: 500 credits",
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
    bonus: "🎁 First month: 2,000 credits",
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
    bonus: "🎁 First month: 5,000 credits",
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
    <section className="bg-[#111111] py-24 sm:py-32 px-4 w-full">
      <div className="mx-auto max-w-6xl">
        {/* Launch Offer Badge */}
        <div className="flex justify-center mb-10">
          <div className="bg-[#E5FF00] text-black font-bold text-xs sm:text-sm px-6 py-3 rounded-full flex items-center gap-2">
            <span>🎉</span>
            LAUNCH OFFER: GET 2x CREDITS ON YOUR FIRST MONTH
          </div>
        </div>

        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-medium text-white tracking-tight mb-4">
            Price that scales with you
          </h2>
          <p className="text-gray-400 text-lg mb-2">Premium Quality at Every Tier.</p>
          <p className="text-gray-500 text-sm">
            4 images = 10 credits <span className="mx-2">•</span> 1 video = 10 credits
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 max-w-5xl mx-auto items-start">
          {plans.map((plan) => {
            const isLight = plan.theme === "light";

            return (
              <div
                key={plan.id}
                className={`relative rounded-3xl p-8 flex flex-col h-full border ${isLight
                  ? "bg-white border-[#E5FF00] shadow-[0_0_40px_rgba(229,255,0,0.15)]"
                  : "bg-black border-[#333]"
                  }`}
              >
                {plan.mostPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#E5FF00] text-black text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Most Popular
                  </div>
                )}

                <div className="mb-8">
                  <h3
                    className={`text-xl font-medium mb-4 ${isLight ? "text-black" : "text-white"
                      }`}
                  >
                    {plan.name}
                  </h3>
                  <div
                    className={`text-4xl font-semibold mb-6 ${isLight ? "text-black" : "text-white"
                      }`}
                  >
                    {plan.price}
                  </div>
                  <div
                    className={`font-medium mb-1 ${isLight ? "text-black" : "text-white"
                      }`}
                  >
                    {plan.credits}
                  </div>
                  <div
                    className={`text-sm mb-6 ${isLight ? "text-gray-500" : "text-gray-500"
                      }`}
                  >
                    {plan.conversion}
                  </div>

                  <div
                    className={`inline-block px-4 py-2 rounded-full text-xs font-medium mb-8 ${isLight
                      ? "bg-gray-100 text-black border border-gray-200"
                      : "bg-[#252A0A] text-[#E5FF00] border border-[#3E4A10]"
                      }`}
                  >
                    {plan.bonus}
                  </div>
                </div>

                <div className="grow">
                  <ul className="space-y-4 mb-8">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {isLight ? darkCheck : defaultCheck}
                        </div>
                        <span
                          className={`text-sm ${isLight ? "text-gray-700" : "text-gray-300"
                            }`}
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  className={`w-full py-4 rounded-xl text-sm font-semibold transition-colors ${isLight
                    ? "bg-[#111] text-white hover:bg-black"
                    : "bg-white text-black hover:bg-gray-100"
                    }`}
                >
                  Start free trial
                </button>
              </div>
            );
          })}
        </div>

        {/* Enterprise Bottom Banner */}
        <div className="max-w-5xl mx-auto rounded-3xl border border-[#333] bg-[#1A1A1A] p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <h3 className="text-2xl font-medium text-white mb-2">
              Need more? Let&apos;s talk about enterprise options
            </h3>
            <p className="text-gray-400">
              Get custom plans, dedicated support, and exclusive features tailored to your brand&apos;s creative needs.
            </p>
          </div>
          <button className="whitespace-nowrap px-8 py-3 rounded-full border border-gray-400 text-white hover:bg-white/5 transition-colors font-medium text-sm">
            TALK TO SALES
          </button>
        </div>
      </div>
    </section>
  );
}
