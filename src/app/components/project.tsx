"use client";

import { useState, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import type { PublicProject } from "@/lib/publicProjects";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function ProjectCards({
  projects,
}: {
  projects: PublicProject[];
}) {
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());

  const toggleCard = (index: number) => {
    setFlippedCards((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleCard(index);
    }
  };

  const isFlipped = (index: number) => flippedCards.has(index);

  if (projects.length === 0) return null;

  return (
    <section className="py-16">
      <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12 text-[var(--foreground)]">
        Projects
      </h2>
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-4 sm:px-6 max-w-6xl mx-auto"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-30px" }}
      >
        {projects.map((project, index) => (
          <motion.div
            key={index}
            variants={cardVariants}
            onClick={() => toggleCard(index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            whileHover={{ y: -4 }}
            className="cursor-pointer card-flip-container relative h-72"
            role="button"
            tabIndex={0}
            aria-label={`${project.title} — ${isFlipped(index) ? "Click to see overview" : "Click to see details"}`}
            aria-expanded={isFlipped(index)}
          >
            <div
              className={`relative w-full h-full card-flip ${
                isFlipped(index) ? "rotate-y-180" : ""
              }`}
            >
              {/* Front */}
              <div className="card-front justify-center">
                <h3 className="text-lg font-bold text-[var(--foreground)] mb-2 break-words">
                  {project.title}
                </h3>
                {project.shortDesc.trim() !== "" && (
                  <p className="text-sm text-[var(--muted)] mb-4 leading-relaxed break-words">
                    {project.shortDesc}
                  </p>
                )}
                {project.tech.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {project.tech.map((t, i) => (
                      <span
                        key={i}
                        className="min-w-0 max-w-full break-words px-2.5 py-1 text-xs font-medium rounded-full bg-[var(--accent-blue-subtle)] text-[var(--accent-blue)] border border-[var(--accent-blue)]/15"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-4 text-xs text-[var(--accent-blue)] font-medium">
                  Click to see details →
                </p>
              </div>

              {/* Back */}
              <div className="card-back">
                <h4 className="text-md font-bold text-[var(--foreground)] mb-3 break-words">
                  {project.title}
                </h4>
                {project.description.length > 0 && (
                  <ul className="space-y-2 text-sm text-[var(--foreground-soft)] mb-4 flex-1">
                    {project.description.map((line, i) => (
                      <li key={i} className="flex gap-2">
                        <span
                          aria-hidden="true"
                          className="text-[var(--accent-rose)] mt-1 shrink-0 before:content-['•']"
                        />
                        <span className="min-w-0 break-words">{line}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {(project.github !== "" || project.demo !== "") && (
                  <div className="flex gap-3 text-sm font-medium mt-auto pt-2 border-t border-[var(--border)]">
                    {project.github !== "" && (
                      <a
                        href={project.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[var(--accent-blue)] hover:underline"
                      >
                        GitHub ↗
                      </a>
                    )}
                    {project.demo !== "" && (
                      <a
                        href={project.demo}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[var(--accent-blue)] hover:underline"
                      >
                        Live Demo ↗
                      </a>
                    )}
                  </div>
                )}
                <p className="mt-2 text-xs text-[var(--accent-rose)] font-medium">
                  ← Click to go back
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
