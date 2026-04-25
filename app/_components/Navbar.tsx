"use client";

import { useState, useEffect } from "react";
import Brand from "./Brand";
import AuthButtons from "./AuthButton";

export default function Navbar() {

  return (
    <header
      className="absolute inset-x-0 top-0 z-50 transition-all duration-300 bg-black/70 backdrop-blur-xl py-4"
    >
      <nav
        className="flex base-container items-center justify-between px-4 sm:px-6 lg:px-0"
        aria-label="Main navigation"
      >
        <Brand />
        <AuthButtons />
      </nav>
    </header>
  );
}
