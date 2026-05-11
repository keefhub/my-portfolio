"use client";
import Image from "next/image";
import { motion } from "framer-motion";

interface Tool {
  name: string;
  icon: string;
}

interface TechCategory {
  category: string;
  tools: Tool[];
}

const techStack: TechCategory[] = [
  {
    category: "Frontend",
    tools: [
      { name: "React", icon: "/icons/react.png" },
      { name: "Angular", icon: "/icons/angular.png" },
    ],
  },
  {
    category: "Backend",
    tools: [
      { name: "Node.js", icon: "/icons/node.png" },
      { name: "ASP.NET Core", icon: "/icons/dotnet.png" },
    ],
  },
  {
    category: "Database",
    tools: [
      { name: "MySQL", icon: "/icons/mysql.png" },
      { name: "MS SQL", icon: "/icons/sqlserver.png" },
    ],
  },
  {
    category: "Languages",
    tools: [
      { name: "C#", icon: "/icons/csharp.png" },
      { name: "JavaScript", icon: "/icons/javascript.png" },
      { name: "TypeScript", icon: "/icons/typescript.png" },
    ],
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const categoryVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

const toolVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

export default function TechStack() {
  return (
    <section className="py-16" id="tech">
      <h2 className="text-3xl sm:text-4xl font-bold text-center text-[var(--foreground)] mb-12">
        Tech Stack
      </h2>
      <motion.div
        className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-40px" }}
      >
        {techStack.map((section) => (
          <motion.div
            key={section.category}
            variants={categoryVariants}
            className="glass rounded-2xl p-6 flex flex-col items-center hover:shadow-md transition-shadow duration-300"
          >
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-soft)] mb-5">
              {section.category}
            </h3>
            <div className="flex flex-wrap gap-4 justify-center">
              {section.tools.map((tool) => (
                <motion.div
                  key={tool.name}
                  variants={toolVariants}
                  className="flex flex-col items-center w-18 p-2 rounded-xl hover:bg-[var(--accent-blue-subtle)] transition-colors duration-300"
                  whileHover={{ y: -4, scale: 1.08 }}
                  transition={{ duration: 0.25 }}
                >
                  <Image
                    src={tool.icon}
                    alt={`${tool.name} icon`}
                    width={48}
                    height={48}
                    className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
                  />
                  <p className="text-xs text-center mt-2 text-[var(--foreground-soft)] font-medium">
                    {tool.name}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
