"use client";

import { useState, useEffect } from "react";
import Brand from "./Brand";
import AuthButtons from "./AuthButton";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 border-b ${scrolled
        ? "bg-black/40 backdrop-blur-xl border-border-subtle py-4"
        : "bg-transparent border-transparent py-5"
        }`}
    >
      <nav
        className="mx-auto flex max-w-10xl items-center justify-between px-4 sm:px-6 lg:px-20"
        aria-label="Main navigation"
      >
        <Brand />
        <AuthButtons />
      </nav>
    </header>
  );
}
