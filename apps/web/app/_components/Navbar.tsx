import AuthButtons from "./AuthButton";
import Brand from "./Brand";

export default function Navbar() {
  return (
    <header className="absolute inset-x-0 top-0 z-50 bg-black/70 py-4 backdrop-blur-xl transition-all duration-300">
      <nav
        className="base-container flex items-center justify-between px-4 sm:px-6 lg:px-0"
        aria-label="Main navigation"
      >
        <Brand />
        <AuthButtons />
      </nav>
    </header>
  );
}
