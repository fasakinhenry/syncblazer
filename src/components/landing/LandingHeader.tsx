import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { List, Moon, Sun, X } from "@phosphor-icons/react";
import { Logo } from "@/components/Logo.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { useTheme } from "@/context/ThemeContext.tsx";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Rooms and Notes" },
  { href: "#local-first", label: "Local first" },
  { href: "#use-cases", label: "Who it's for" },
];

export function LandingHeader() {
  const { effectiveTheme, setTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleTheme = () => setTheme(effectiveTheme === "dark" ? "light" : "dark");

  return (
    <header
      className={`sticky top-0 z-50 border-b bg-background/90 backdrop-blur transition-colors ${
        scrolled ? "border-border" : "border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />

        <nav className="hidden items-center gap-8 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            {effectiveTheme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <Link to="/login">
            <Button variant="ghost">Log in</Button>
          </Link>
          <Link to="/register">
            <Button>Get started</Button>
          </Link>
        </div>

        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          className="rounded-lg p-2 text-text-primary sm:hidden"
        >
          {menuOpen ? <X className="h-6 w-6" /> : <List className="h-6 w-6" />}
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-border bg-background px-4 py-4 sm:hidden">
          <nav className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-2 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex gap-2 border-t border-border pt-3">
            <Link to="/login" className="flex-1">
              <Button variant="secondary" className="w-full">
                Log in
              </Button>
            </Link>
            <Link to="/register" className="flex-1">
              <Button className="w-full">Get started</Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
