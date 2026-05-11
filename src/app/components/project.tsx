"use client";

import { useState, type KeyboardEvent } from "react";
import { motion } from "framer-motion";

interface Project {
  title: string;
  shortDesc: string;
  description: string[];
  tech: string[];
  github: string;
  demo: string;
}

const projects: Project[] = [
  {
    title: "Prime Unity Electronics Pte Ltd",
    shortDesc:
      "Responsive corporate site for a semiconductor supplier, built and deployed with Next.js SSR.",
    description: [
      "Problem statement: Client needed a clean, professional online presence to showcase their semiconductor sourcing services.",
      "Built and deployed a static corporate site with Next.js and SSR for performance, SEO, and responsive design.",
      "Embedded microsoft excel as product catalog for easy updates by client.",
    ],
    tech: ["Next.js", "Tailwind", "Vercel"],
    github: "",
    demo: "https://www.primeunity.biz/",
  },
  {
    title: "Portfolio Website",
    shortDesc:
      "A website highlighting my skills and projects — essentially, my interactive resume.",
    description: [
      "Problem statement: Fear of missing out… many software engineers have a portfolio, so here's mine.",
      "Showcases my frontend skills with scroll animations, flip cards, and a fully responsive UI.",
    ],
    tech: ["Next.js", "Tailwind", "Framer Motion"],
    github: "https://github.com/keefhub/my-portfolio",
    demo: "",
  },
  {
    title: "Recipe Database",
    shortDesc:
      "Full-stack recipe app with authentication and full CRUD functionality.",
    description: [
      "Problem statement: My mum has too many recipes, but can't remember how to cook them all…",
      "Built with ASP.NET Core 8.0 (backend) and ReactJS (frontend).",
    ],
    tech: ["React.js", "ASP.NET Core (8.0)", "C#", "MySQL", "Material UI"],
    github: "https://github.com/keefhub/C-projects",
    demo: "",
  },
  {
    title: "Mobile App for Travel Planning",
    shortDesc:
      "Full-stack mobile app with auth, CRUD, and AI-powered planning.",
    description: [
      "Problem statement: I love traveling but hate planning. Plus, I'm always looking for good recommendations.",
      "Built using React Native and Expo GO, backed by Firebase.",
      "Inspired by Xiao Hong Shu — users share their trips and plan future ones with AI support.",
    ],
    tech: ["React Native", "Javascript", "Firebase", "Gluestack UI"],
    github: "https://github.com/keefhub/final-year-project",
    demo: "",
  },
  {
    title: "Web Application Design",
    shortDesc: "Web portal for online purchase of fashion items.",
    description: [
      "Built with a team of 2. No frameworks, just pure JS, HTML, and PHP.",
      "Implemented a shopping cart, user authentication, and a product catalog.",
      "Designed and planned the DB schema, wireframing, and UI/UX.",
    ],
    tech: ["Javascript", "PHP", "MySQL", "HTML", "CSS"],
    github: "https://github.com/keefhub/WebApp-Design",
    demo: "",
  },
  {
    title: "Hackathon Project - CloudHacks 2023",
    shortDesc: "1st Place winner at CloudHacks 2023.",
    description: [
      "Built a GPT-style chatbot from a forked open-source repository using Flask.",
      "Awarded for innovation and technical execution during the competition.",
    ],
    tech: ["React", "Javascript", "Python Flask"],
    github: "https://github.com/keefhub/CloudHacks-Team11",
    demo: "",
  },
];

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

export default function ProjectCards() {
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
                <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">
                  {project.title}
                </h3>
                <p className="text-sm text-[var(--muted)] mb-4 leading-relaxed">
                  {project.shortDesc}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {project.tech.map((t) => (
                    <span
                      key={t}
                      className="px-2.5 py-1 text-xs font-medium rounded-full bg-[var(--accent-blue-subtle)] text-[var(--accent-blue)] border border-[var(--accent-blue)]/15"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-xs text-[var(--accent-blue)] font-medium">
                  Click to see details →
                </p>
              </div>

              {/* Back */}
              <div className="card-back">
                <h4 className="text-md font-bold text-[var(--foreground)] mb-3">
                  {project.title}
                </h4>
                <ul className="space-y-2 text-sm text-[var(--foreground-soft)] mb-4 flex-1">
                  {project.description.map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[var(--accent-rose)] mt-1 shrink-0">
                        •
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-3 text-sm font-medium mt-auto pt-2 border-t border-[var(--border)]">
                  {project.github && (
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
                  {project.demo && (
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
