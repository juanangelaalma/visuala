"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];  

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "glass-card border-b border-border-subtle py-3"
          : "bg-transparent py-5"
      }`}
    >
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between px-6 lg:px-8"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-bold tracking-tight"
          aria-label="Visuala home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-brand-400 to-accent-500 text-white shadow-glow-brand">
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M9 2L16 14H2L9 2Z"
                fill="currentColor"
                fillOpacity="0.9"
              />
            </svg>
          </span>
          <span className="gradient-text">Visuala</span>
        </Link>

        {/* Desktop Links */}
        <ul className="hidden items-center gap-1 md:flex" role="list">
          {navLinks.map(({ href, label }) => (
            <li key={href}>
              <a
                href={href}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>

        {/* CTAs */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            id="navbar-cta"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-glow-brand transition-all hover:bg-brand-400 hover:shadow-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            Get started free
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          id="mobile-menu-toggle"
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          aria-label="Toggle navigation menu"
          className="rounded-lg p-2 text-text-secondary hover:bg-surface-2 md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            {mobileOpen ? (
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              />
            ) : (
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
              />
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          className="glass-card mx-4 mt-2 rounded-2xl p-4 md:hidden"
        >
          <ul className="flex flex-col gap-1" role="list">
            {navLinks.map(({ href, label }) => (
              <li key={href}>
                <a
                  href={href}
                  className="block rounded-lg px-4 py-3 text-sm font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                  onClick={() => setMobileOpen(false)}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3">
            <Link
              href="/login"
              className="rounded-lg px-4 py-3 text-center text-sm font-medium text-text-secondary hover:bg-surface-2"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand-500 px-4 py-3 text-center text-sm font-semibold text-white"
            >
              Get started free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
