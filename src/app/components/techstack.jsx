"use client";
import Image from "next/image";

const techStack = [
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

export default function TechStack() {
  return (
    <section className="py-16 " id="tech">
      <h2 className="text-3xl font-bold text-center text-[#333] mb-12">
        Tech Stack
      </h2>
      <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {techStack.map((section, idx) => (
          <div key={idx}>
            <h3 className="text-xl font-semibold mb-4 text-[#555]">
              {section.category}
            </h3>
            <div className="flex flex-wrap gap-6 justify-center">
              {section.tools.map((tool, i) => (
                <div key={i} className="flex flex-col items-center w-20">
                  <Image
                    src={tool.icon}
                    alt={tool.name}
                    width={60}
                    height={60}
                    className="w-12 h-12 object-contain"
                  />
                  <p className="text-sm text-center mt-2 text-[#333]">
                    {tool.name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
