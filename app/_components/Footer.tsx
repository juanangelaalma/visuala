import Link from "next/link";
import Brand from "./Brand";

const socialLinks = [
  {
    label: "X",
    href: "https://x.com/visualaai",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
      </svg>
    ),
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/visuala.ai",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
        <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"></path>
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
      </svg>
    ),
  },
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@visuala.ai",
    icon: (
      <svg viewBox="0 0 32 32" fill="currentColor" className="h-5 w-5">
        <path d="M16.656 1.029c1.637-0.025 3.262-0.012 4.886-0.025 0.054 2.031 0.878 3.859 2.189 5.213l-0.002-0.002c1.411 1.271 3.247 2.095 5.271 2.235l0.028 0.002v5.036c-1.912-0.048-3.71-0.489-5.331-1.247l0.082 0.034c-0.784-0.377-1.447-0.764-2.077-1.196l0.052 0.034c-0.012 3.649 0.012 7.298-0.025 10.934-0.103 1.853-0.719 3.543-1.707 4.954l0.020-0.031c-1.652 2.366-4.328 3.919-7.371 4.011l-0.014 0c-0.123 0.006-0.268 0.009-0.414 0.009-1.73 0-3.347-0.482-4.725-1.319l0.040 0.023c-2.508-1.509-4.238-4.091-4.558-7.094l-0.004-0.041c-0.025-0.625-0.037-1.25-0.012-1.862 0.49-4.779 4.494-8.476 9.361-8.476 0.547 0 1.083 0.047 1.604 0.136l-0.056-0.008c0.025 1.849-0.050 3.699-0.050 5.548-0.423-0.153-0.911-0.242-1.42-0.242-1.868 0-3.457 1.194-4.045 2.861l-0.009 0.030c-0.133 0.427-0.21 0.918-0.21 1.426 0 0.206 0.013 0.41 0.037 0.61l-0.002-0.024c0.332 2.046 2.086 3.59 4.201 3.59 0.061 0 0.121-0.001 0.181-0.004l-0.009 0c1.463-0.044 2.733-0.831 3.451-1.994l0.010-0.018c0.267-0.372 0.45-0.822 0.511-1.311l0.001-0.014c0.125-2.237 0.075-4.461 0.087-6.698 0.012-5.036-0.012-10.060 0.025-15.083z" />
      </svg>
    ),
  },
  {
    label: "Facebook",
    href: "https://facebook.com/visuala",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-6">
        <path fillRule="evenodd" d="M15.1742424,5.3203125 L17,5.3203125 L17,2.140625 C16.6856061,2.09765625 15.6022727,2 14.3409091,2 C11.7083333,2 9.90530303,3.65625 9.90530303,6.69921875 L9.90530303,9.5 L7,9.5 L7,13.0546875 L9.90530303,13.0546875 L9.90530303,22 L13.4659091,22 L13.4659091,13.0546875 L16.2537879,13.0546875 L16.6969697,9.5 L13.4659091,9.5 L13.4659091,7.05078125 C13.4659091,6.0234375 13.7424242,5.3203125 15.1742424,5.3203125 Z" />
      </svg>
    ),
  },
];

export default function Footer() {
  return (
    <footer className="bg-primary border-t border-white/10 w-full mt-auto relative pb-12" role="contentinfo">
      <div className="mx-auto w-full max-w-screen-2xl px-6 lg:px-20 py-12">
        {/* Top Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10 md:gap-0">
          {/* Brand/Logo Area */}
          <Link href="/" aria-label="Visuala home" className="flex items-center justify-center">
            <Brand theme="dark" />
          </Link>

          {/* Social Links */}
          <div className="flex flex-col items-start md:items-end gap-4">
            <span className="text-black font-normal text-base tracking-tight">Follow Us</span>
            <div className="flex gap-4 items-center text-black">
              {socialLinks.map(({ label, href, icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex items-center justify-center w-5 h-5 opacity-60 hover:opacity-100 transition-opacity"
                >
                  {icon}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="w-full border-t border-black/10 mt-8 pt-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          {/* Copyright */}
          <p className="text-black font-normal text-caption tracking-tight">
            © Visuala AI Inc. All rights reserved.
          </p>

          {/* Legal Links */}
          <div className="flex flex-wrap items-center gap-6 text-black font-normal text-caption tracking-tight">
            <Link href="/terms" className="hover:opacity-70 transition-opacity">
              Terms & Services
            </Link>
            <Link href="/privacy" className="hover:opacity-70 transition-opacity">
              Privacy Policy
            </Link>
            <Link href="/prohibited-use" className="hover:opacity-70 transition-opacity">
              Prohibited Use Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
