"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  type KeyboardEvent,
} from "react";
import { Menu, X, Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "./ThemeProvider";

const sections = ["about", "experience", "projects", "certifications"] as const;

export default function Header() {
  const [activeSection, setActiveSection] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Detect scroll for glass effect
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ScrollSpy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-45% 0px -55% 0px", threshold: 0.1 },
    );

    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // Escape to close
  useEffect(() => {
    const handleEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen]);

  // Lock body scroll when mobile menu open
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const closeMenu = useCallback(() => setIsOpen(false), []);

  const linkBase =
    "relative px-1 py-2 text-sm font-medium transition-colors duration-300";
  const linkActive = "text-[var(--accent-blue)]";
  const linkInactive = "text-[var(--muted)] hover:text-[var(--foreground)]";

  const NavLink = ({
    id,
    mobile = false,
  }: {
    id: string;
    mobile?: boolean;
  }) => {
    const isActive = activeSection === id;
    return (
      <a
        href={`#${id}`}
        className={`${linkBase} ${isActive ? linkActive : linkInactive} ${
          mobile ? "block w-full px-4 py-3 text-base" : ""
        }`}
        onClick={mobile ? closeMenu : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
            if (mobile) closeMenu();
          }
        }}
      >
        {id.charAt(0).toUpperCase() + id.slice(1)}
        {isActive && !mobile && (
          <motion.span
            layoutId="active-pill"
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-0.5 w-5 rounded-full bg-[var(--accent-blue)]"
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        )}
      </a>
    );
  };

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-400 ${
          scrolled ? "glass shadow-sm" : "bg-transparent"
        }`}
        role="banner"
      >
        <nav
          className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between"
          role="navigation"
          aria-label="Main navigation"
        >
          {/* Brand */}
          <a
            href="#"
            className="flex items-center gap-2 text-lg font-bold text-[var(--foreground)] hover:opacity-80 transition-opacity shrink-0"
            aria-label="thegoldenpothos — Back to top"
          >
            <span className="text-xl">🌿</span>
            <span className="hidden sm:inline gradient-text">
              thegoldenpothos
            </span>
            <span className="sm:hidden gradient-text">tgp</span>
          </a>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {sections.map((id) => (
              <NavLink key={id} id={id} />
            ))}
            <div className="w-px h-5 bg-[var(--border)] mx-3" />
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-[var(--accent-blue-subtle)] transition-colors"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              <motion.div
                initial={false}
                animate={{ rotate: theme === "dark" ? 180 : 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
              >
                {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
              </motion.div>
            </button>
          </div>

          {/* Mobile toggles */}
          <div className="md:hidden flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-[var(--accent-blue-subtle)] transition-colors"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button
              ref={buttonRef}
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-lg hover:bg-[var(--accent-blue-subtle)] transition-colors"
              aria-label={
                isOpen ? "Close navigation menu" : "Open navigation menu"
              }
              aria-expanded={isOpen}
              aria-controls="mobile-menu"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
              onClick={closeMenu}
              aria-hidden="true"
            />
            <motion.div
              id="mobile-menu"
              ref={menuRef}
              role="menu"
              aria-label="Mobile navigation"
              initial={{ opacity: 0, y: -16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.98 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed top-16 inset-x-4 z-50 md:hidden glass rounded-2xl shadow-lg p-4"
            >
              <div className="flex flex-col gap-1">
                {sections.map((id) => (
                  <NavLink key={id} id={id} mobile />
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
