"use client";

import { useState, useEffect } from "react";
import {
  Github,
  Linkedin,
  Mail,
  FileText,
  ArrowUp,
  Link as LinkIcon,
} from "lucide-react";
import type { ContactKind, ContactLink } from "@/lib/publicProfile";

const ICONS = {
  github: Github,
  linkedin: Linkedin,
  mail: Mail,
  file: FileText,
  link: LinkIcon,
} satisfies Record<ContactKind, typeof Github>;
import { motion, AnimatePresence } from "framer-motion";

export default function Footer({
  name,
  links,
}: {
  name?: string;
  links?: ContactLink[];
}) {
  const [showFab, setShowFab] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowFab(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <footer className="relative bg-[var(--background-alt)] border-t border-[var(--border)]">
        {/* Gradient separator */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--accent-blue) 30%, var(--accent-rose) 70%, transparent)",
          }}
          aria-hidden="true"
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Brand */}
            <div className="text-center md:text-left min-w-0 max-w-full wrap-anywhere">
              <p className="text-lg font-bold text-[var(--foreground)] flex items-center justify-center md:justify-start gap-2">
                <span>🌿</span>
                <span className="gradient-text">thegoldenpothos</span>
              </p>
              <p className="text-sm text-[var(--muted-soft)] mt-2">
                © {new Date().getFullYear()}
                {name ? ` ${name}` : ""} — Built with Next.js & ❤️
              </p>
            </div>

            {/* Contact links */}
            {links && links.length > 0 && (
              <div className="flex items-center gap-1">
                {links.map(({ kind, href, label }, i) => {
                  const Icon = ICONS[kind];
                  return (
                    <a
                      key={i}
                      href={href}
                      target={href.startsWith("http") ? "_blank" : undefined}
                      rel={
                        href.startsWith("http")
                          ? "noopener noreferrer"
                          : undefined
                      }
                      className="p-2.5 text-[var(--muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue-subtle)] rounded-xl transition-all duration-300"
                      aria-label={label}
                    >
                      <Icon size={18} />
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </footer>

      {/* Floating back-to-top button */}
      <AnimatePresence>
        {showFab && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToTop}
            className="fixed bottom-6 right-6 z-40 p-3 glass rounded-full shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            aria-label="Scroll to top"
          >
            <ArrowUp size={18} />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
