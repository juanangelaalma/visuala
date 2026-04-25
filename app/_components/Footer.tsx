import Link from "next/link";

const socialLinks = [
  {
    label: "X",
    href: "https://twitter.com/visuala",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 hover:opacity-70 transition-opacity">
        <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
      </svg>
    ),
  },
  {
    label: "Instagram",
    href: "https://instagram.com/visuala",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px] hover:opacity-70 transition-opacity">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
        <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"></path>
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
      </svg>
    ),
  },
  {
    label: "TikTok",
    href: "https://tiktok.com/@visuala",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 hover:opacity-70 transition-opacity">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-1.01-.01 2.21.03 4.43-.02 6.64-.13 3.32-2.14 6.37-5.26 7.21-3.6 1-7.42-.87-8.68-4.32-1.2-3.2 1.1-6.73 4.41-7.22 1.18-.18 2.37-.02 3.5.38v4.06c-1.39-.42-3.05-.18-3.95 1.05-.88 1.19-.66 3.12.54 3.97 1.57 1.11 4.12.39 4.67-1.49.33-1.1.25-2.28.25-3.41V.01h.46z" />
      </svg>
    ),
  },
  {
    label: "Facebook",
    href: "https://facebook.com/visuala",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-[22px] w-[22px] hover:opacity-70 transition-opacity">
        <path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.312h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z" />
      </svg>
    ),
  },
];

export default function Footer() {
  return (
    <footer className="bg-[#E5FF00] w-full mt-auto" role="contentinfo">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 py-16 md:py-24">

        {/* Top Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-10 md:gap-0">

          {/* Brand/Logo Area */}
          <Link href="/" className="group" aria-label="Visuala home">
            <div className="relative font-black text-5xl sm:text-[64px] tracking-tighter text-black leading-none flex items-center">
              <span className="relative inline-block pr-1">
                <div className="absolute top-[40%] -left-3 sm:-left-4 w-7 sm:w-10 h-[6px] sm:h-[8px] bg-black z-10 transition-transform group-hover:scale-x-110" />
                V
              </span>
              ISUALA
            </div>
          </Link>

          {/* Social Links */}
          <div className="flex flex-col items-start md:items-end gap-3">
            <span className="text-black font-semibold text-[15px]">Follow Us</span>
            <div className="flex gap-4 items-center text-black">
              {socialLinks.map(({ label, href, icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex items-center justify-center p-1"
                >
                  {icon}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-black/10 mb-8" />

        {/* Bottom Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <p className="text-black/80 font-medium text-[13px] sm:text-sm">
            © Visuala AI Inc. All rights reserved.
          </p>

          <div className="flex flex-wrap items-center gap-6 sm:gap-8 text-black/80 font-medium text-[13px] sm:text-sm">
            <Link href="/terms" className="hover:text-black hover:underline underline-offset-4 transition-colors">
              Terms & Services
            </Link>
            <Link href="/privacy" className="hover:text-black hover:underline underline-offset-4 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/prohibited-use" className="hover:text-black hover:underline underline-offset-4 transition-colors">
              Prohibited Use Policy
            </Link>
          </div>
        </div>

      </div>
    </footer>
  );
}
