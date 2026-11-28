"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { motion, useInView } from "framer-motion";
import type { PublicExperienceEntry } from "@/lib/publicExperience";

function TimelineCard({
  item,
  index,
}: {
  item: PublicExperienceEntry;
  index: number;
}) {
  const [flipped, setFlipped] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });

  const isLeft = index % 2 === 0;

  const handleToggle = () => setFlipped(!flipped);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <div className="relative mb-16">
      <div
        className={`flex flex-col md:flex-row items-start md:gap-0 ${
          isLeft ? "md:flex-row" : "md:flex-row-reverse"
        }`}
      >
        {/* Spacer for alternating layout */}
        <div className="hidden md:block w-1/2 shrink-0" />

        {/* Year badge — sits on timeline between spacer and card */}
        <div className="hidden md:flex shrink-0 z-20 pt-2 px-2">
          <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--surface)] border-2 border-[var(--accent-blue)] shadow-md text-sm font-bold text-[var(--accent-blue)]">
            {item.year}
          </span>
        </div>

        {/* Card */}
        <motion.div
          ref={ref}
          className="relative w-full md:w-[calc(50%-2.5rem)] h-[280px] sm:h-[260px] cursor-pointer perspective-1000"
          initial={{ opacity: 0, x: isLeft ? -80 : 80 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          aria-label={`${item.title} at ${item.company} — ${flipped ? "Click to see overview" : "Click to see details"}`}
          aria-expanded={flipped}
          whileHover={{ y: -4 }}
        >
          <motion.div
            className="absolute inset-0 preserve-3d"
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* Front */}
            <div className="card-front justify-center">
              <div className="flex items-center gap-2 mb-1 md:hidden">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--accent-blue-subtle)] text-[var(--accent-blue)]">
                  {item.year}
                </span>
              </div>
              <p className="text-xs text-[var(--muted-soft)] mb-1 break-words">
                {item.duration}
              </p>
              <h3 className="text-xl font-bold text-[var(--foreground)] mb-1 break-words">
                {item.title}
              </h3>
              <p className="text-sm text-[var(--accent-blue)] font-medium break-words">
                {item.company}
              </p>
              <p className="mt-3 text-[var(--foreground-soft)] text-sm leading-relaxed break-words">
                {item.description}
              </p>
              <p className="mt-3 text-xs text-[var(--accent-blue)] font-medium">
                Click to learn more →
              </p>
            </div>

            {/* Back */}
            <div className="card-back overflow-y-auto">
              {item.details.length > 0 ? (
                <>
                  <h4 className="text-lg font-bold text-[var(--foreground)] mb-3">
                    What I Did
                  </h4>
                  <ul className="space-y-2 text-[var(--foreground-soft)] text-sm">
                    {item.details.map((point, i) => (
                      <li
                        key={i}
                        className="flex gap-2 before:content-['•'] before:text-[var(--accent-rose)] before:mt-1 before:shrink-0"
                      >
                        <span className="break-words min-w-0">{point}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p className="text-[var(--foreground-soft)] text-sm break-words">
                    {item.duration}
                  </p>
                  <p className="text-[var(--foreground-soft)] text-sm break-words">
                    {item.description}
                  </p>
                </>
              )}
              <p className="mt-4 text-xs text-[var(--accent-rose)] font-medium break-words">
                ← Click to go back
              </p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

export default function ExperienceTimeline({
  entries,
}: {
  entries: PublicExperienceEntry[];
}) {
  if (entries.length === 0) return null;
  return (
    <section className="py-16">
      <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16 text-[var(--foreground)]">
        Experience
      </h2>
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
        {/* Vertical line */}
        <div
          className="absolute left-4 md:left-1/2 md:-translate-x-1/2 top-0 bottom-0 w-0.5"
          style={{
            background:
              "linear-gradient(180deg, var(--accent-blue), var(--accent-rose), var(--accent-blue))",
          }}
          aria-hidden="true"
        />

        {entries.map((item, index) => (
          <TimelineCard key={index} item={item} index={index} />
        ))}
      </div>
    </section>
  );
}
