"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const projects = [
  {
    title: "Portfolio Website",
    shortDesc:
      "A website highlighting my skills and projects — essentially, my interactive resume.",
    description: [
      "Problem statement: Fear of missing out… many software engineers have a portfolio, so here’s mine.",
      "Showcases my frontend skills with scroll animations, flip cards, and a fully responsive UI.",
    ],
    tech: ["Next.js", "Tailwind", "Framer Motion"],
    github: "https://github.com/yourusername/portfolio",
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
      "Actually got grade A- for this module!",
      "",
    ],
    tech: ["Javascript", "php", "MySQL", "HTML", "CSS"],
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

export default function ProjectCards() {
  const [flipped, setFlipped] = useState(null);

  return (
    <section id="projects" className="py-16">
      <h2 className="text-3xl font-bold text-center mb-12 text-[#333]">
        Projects
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 px-4 max-w-6xl mx-auto">
        {projects.map((project, index) => (
          <motion.div
            key={index}
            onClick={() => setFlipped(flipped === index ? null : index)}
            whileHover={{ scale: 1.02 }}
            className="cursor-pointer card-flip-inner relative h-64"
          >
            <div
              className={`relative w-full h-full card-flip ${
                flipped === index ? "rotate-y-180" : ""
              }`}
            >
              {/* Front */}
              <div className="card-front bg-white flex flex-col justify-center p-4 rounded-lg shadow-lg">
                <h3 className="text-lg font-semibold text-[#333]">
                  {project.title}
                </h3>
                <p className="text-sm text-[#555] mt-2">{project.shortDesc}</p>
                <div className="flex flex-wrap gap-2 mt-4 text-xs text-[#444]">
                  {project.tech.map((t, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 bg-[#E0ECF9] rounded-full"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Back */}
              <div className="card-back bg-[#FDF6F0] p-4 rounded-lg shadow-lg overflow-auto">
                <h4 className="text-md font-semibold text-[#333] mb-2">
                  {project.title}
                </h4>
                {Array.isArray(project.description) ? (
                  <ul className="list-disc list-inside text-sm text-[#555] space-y-1 mb-4">
                    {project.description.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[#555] mb-4">
                    {project.description}
                  </p>
                )}
                <div className="flex gap-4 text-sm">
                  {project.github && (
                    <a
                      href={project.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#A3C4F3] font-semibold"
                    >
                      GitHub
                    </a>
                  )}
                  {project.demo && (
                    <a
                      href={project.demo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#A3C4F3] font-semibold"
                    >
                      Live Demo
                    </a>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
