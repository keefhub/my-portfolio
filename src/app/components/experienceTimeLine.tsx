"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { motion, useInView } from "framer-motion";

interface ExperienceItem {
  year: string;
  title: string;
  company: string;
  duration: string;
  description: string;
  details: string[];
}

const experienceData: ExperienceItem[] = [
  {
    year: "2024",
    title: "Software Engineer",
    company: "NCS",
    duration: "Jul 2024 - Present",
    description:
      "Worked on full stack development with ASP.NET Core, Angular, and C#.",
    details: [
      "Built and deployed full-stack web applications with ASP.NET Core (4.8 and 8), C#, Bootstrap, and Angular 18.",
      "Designed and implemented SQL stored procedures and managed database schema in Microsoft SQL Server.",
      "Proactively collaborated with cross-functional teams (locally and offshore) to gather requirements and deliver high-quality software solutions.",
      "First job, but loaded with experience and lots to learn!",
    ],
  },
  {
    year: "2023",
    title: "Software Engineer Intern",
    company: "ST Engineering Defence Aerospace",
    duration: "Jan 2023 - Aug 2023",
    description: "Built web apps with Outsystem and automation with Python.",
    details: [
      "Developed interactive dashboards to track its software licensing assets with Outsystem",
      "Scripted automation with Python (Selenium)",
      "Operations of aerospace industry is complex and interesting! What's more interesting is to learn about the magnitude of their software licensing assets.",
    ],
  },
  {
    year: "2022",
    title: "IT Intern",
    company: "Dimerco Express Group",
    duration: "May 2022 - Aug 2022",
    description: "Developed process automation and assisted in IT support.",
    details: [
      "Developed process automation for its finance and billing team with UI Bot.",
      "Managed IT hardware and supported users with IT issues.",
      "Interesting experience, learnt a lot about the logistics industry, finance, and billing system!",
    ],
  },
  {
    year: "2020",
    title: "Bachelor's in Electrical and Electronic Engineering (Honours)",
    company: "Nanyang Technological University",
    duration: "Aug 2020 - May 2024",
    description:
      "Specialized in Computer Engineering, focusing on software development.",
    details: [
      "Modules include - Introduction to Data Science and Artificial Intelligence, Data Structure & Algorithm, Software Engineering, Database Systems, Web Application Design, Information Security.",
      "Final Year Project: Developed mobile app for personalized travel itinerary using OpenAI API, React Native, and Javascript.",
      "Director of Digital Imaging for Welfare Services Club.",
      "Had fun as well :)",
    ],
  },
];

function TimelineCard({
  item,
  index,
}: {
  item: ExperienceItem;
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
              <p className="text-xs text-[var(--muted-soft)] mb-1">
                {item.duration}
              </p>
              <h3 className="text-xl font-bold text-[var(--foreground)] mb-1">
                {item.title}
              </h3>
              <p className="text-sm text-[var(--accent-blue)] font-medium">
                {item.company}
              </p>
              <p className="mt-3 text-[var(--foreground-soft)] text-sm leading-relaxed">
                {item.description}
              </p>
              <p className="mt-3 text-xs text-[var(--accent-blue)] font-medium">
                Click to learn more →
              </p>
            </div>

            {/* Back */}
            <div className="card-back overflow-y-auto">
              <h4 className="text-lg font-bold text-[var(--foreground)] mb-3">
                What I Did
              </h4>
              <ul className="space-y-2 text-[var(--foreground-soft)] text-sm">
                {item.details.map((point, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[var(--accent-rose)] mt-1 shrink-0">
                      •
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-[var(--accent-rose)] font-medium">
                ← Click to go back
              </p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

export default function ExperienceTimeline() {
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

        {experienceData.map((item, index) => (
          <TimelineCard key={index} item={item} index={index} />
        ))}
      </div>
    </section>
  );
}
