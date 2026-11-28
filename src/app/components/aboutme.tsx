"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import type { PublicProfile } from "@/lib/publicProfile";

export default function AboutMe({ profile }: { profile: PublicProfile }) {
  const hasPhoto = profile.photo !== "";
  return (
    <div className="py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col-reverse md:flex-row items-center gap-12 md:gap-16">
        {/* Text */}
        <motion.div
          className={`text-center md:text-left wrap-anywhere min-w-0 ${
            hasPhoto ? "md:w-1/2" : "w-full"
          }`}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-[var(--foreground)] mb-6">
            About Me
          </h2>
          <div className="space-y-4 text-[var(--muted)] leading-relaxed">
            {profile.about.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </motion.div>

        {/* Image */}
        {hasPhoto && (
          <motion.div
            className="md:w-1/2 flex justify-center"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="relative">
              {/* Decorative rings */}
              <div
                className="absolute -inset-4 rounded-[2rem] bg-[var(--accent-blue-subtle)] -rotate-6"
                aria-hidden="true"
              />
              <div
                className="absolute -inset-2 rounded-[2rem] bg-[var(--accent-rose-subtle)] rotate-3"
                aria-hidden="true"
              />
              {/* Image frame */}
              <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-2xl overflow-hidden ring-2 ring-[var(--border)] shadow-lg">
                <Image
                  src={profile.photo}
                  alt={"Portrait of " + profile.name}
                  fill
                  sizes="(max-width: 768px) 256px, 288px"
                  className="object-cover"
                  priority
                />
              </div>
              {/* Accent dots */}
              <div
                className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-[var(--accent-blue)] shadow-[var(--shadow-glow-blue)]"
                aria-hidden="true"
              />
              <div
                className="absolute -bottom-3 -left-3 w-3 h-3 rounded-full bg-[var(--accent-rose)] shadow-[var(--shadow-glow-rose)]"
                aria-hidden="true"
              />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
