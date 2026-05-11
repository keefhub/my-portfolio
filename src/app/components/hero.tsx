"use client";

import { motion } from "framer-motion";
import { ArrowDown, Github, Linkedin, Mail, FileText } from "lucide-react";

export default function Hero() {
  const scrollToAbout = () => {
    document.getElementById("about")?.scrollIntoView({ behavior: "smooth" });
  };

  const socialLinks = [
    {
      icon: Github,
      href: "https://github.com/keefhub",
      label: "Visit GitHub profile",
    },
    {
      icon: Linkedin,
      href: "https://linkedin.com/in/yylim-keith",
      label: "Visit LinkedIn profile",
    },
    { icon: Mail, href: "mailto:limy0313@e.ntu.edu.sg", label: "Send email" },
    { icon: FileText, href: "/resume.pdf", label: "Download resume" },
  ];

  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Animated background orbs */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/4 -left-20 w-[500px] h-[500px] bg-[var(--accent-blue)]/8 rounded-full blur-[120px] animate-float" />
        <div
          className="absolute bottom-1/4 -right-20 w-[400px] h-[400px] bg-[var(--accent-rose)]/8 rounded-full blur-[100px] animate-float"
          style={{ animationDelay: "-3s" }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-[var(--accent-blue-light)]/6 rounded-full blur-[80px] animate-float"
          style={{ animationDelay: "-1.5s" }}
        />
      </div>

      {/* Dot pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, var(--accent-blue) 1px, transparent 1px), radial-gradient(circle at 80% 70%, var(--accent-rose) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
        {/* Greeting */}
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="text-lg sm:text-xl text-[var(--accent-blue)] font-medium mb-4 tracking-wide"
        >
          👋 Hi there, I&apos;m
        </motion.p>

        {/* Name — gradient text */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="text-5xl sm:text-6xl md:text-8xl font-extrabold mb-6 leading-[1.05] tracking-tight gradient-text"
        >
          Keith Lim
        </motion.h1>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="text-lg sm:text-xl md:text-2xl text-[var(--muted)] mb-10 max-w-2xl mx-auto leading-relaxed"
        >
          Software engineer by profession — plant lover, coffee enthusiast, and
          photographer at heart.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-wrap items-center justify-center gap-4 mb-14"
        >
          <a
            href="#projects"
            className="group inline-flex items-center gap-2 px-7 py-3.5 bg-[var(--accent-blue)] text-white font-semibold rounded-full transition-all duration-300 hover:shadow-[var(--shadow-glow-blue)] hover:-translate-y-0.5"
          >
            View My Work
            <ArrowDown
              size={18}
              className="transition-transform duration-300 group-hover:translate-y-0.5"
            />
          </a>
          <a
            href="#about"
            className="inline-flex items-center gap-2 px-7 py-3.5 border-2 border-[var(--border-strong)] text-[var(--foreground)] font-semibold rounded-full hover:border-[var(--accent-blue)] hover:text-[var(--accent-blue)] transition-all duration-300 hover:-translate-y-0.5"
          >
            About Me
          </a>
        </motion.div>

        {/* Social links */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center justify-center gap-2"
        >
          {socialLinks.map(({ icon: Icon, href, label }, i) => (
            <motion.a
              key={label}
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="p-3 text-[var(--muted)] hover:text-[var(--accent-blue)] transition-all duration-300 rounded-full hover:bg-[var(--accent-blue-subtle)] hover:scale-110"
              aria-label={label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.75 + i * 0.08, duration: 0.4 }}
            >
              <Icon size={22} />
            </motion.a>
          ))}
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.button
        onClick={scrollToAbout}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 cursor-pointer group"
        aria-label="Scroll to About section"
      >
        <span className="text-xs text-[var(--muted-soft)] tracking-widest uppercase">
          Scroll
        </span>
        <motion.span
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="text-[var(--muted)] group-hover:text-[var(--accent-blue)] transition-colors"
        >
          <ArrowDown size={22} />
        </motion.span>
      </motion.button>
    </section>
  );
}
