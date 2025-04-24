"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useAnimation, useInView } from "framer-motion";

const experienceData = [
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
      "Operations of aerospace indsutry is complex and interesting! What's more interesting is to learn about the magnitude of their software licensing assets.",
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
      "Modules include - Introduction to Data Science and Artifical Intelligence, Data Structure & Algorithm, Software Engineering, Database Systems, Web Application Design, Information Security.",
      "Final Year Project: Developed mobile app for personalized travel itinerary using OpenAI API, React Native, and Javascript.",
      "Director of Digital Imaging for Welfare Services Club.",
      "Had fun as well :)",
    ],
  },
];

function TimelineCard({ item, index }) {
  const [flipped, setFlipped] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, threshold: 0.2 });
  const controls = useAnimation();

  useEffect(() => {
    if (inView) controls.start("visible");
  }, [inView, controls]);

  const variants = {
    hidden: {
      opacity: 0,
      x: index % 2 === 0 ? -100 : 100,
    },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.6, ease: "easeOut" },
    },
  };

  return (
    <div
      className={`mb-12 flex flex-col md:flex-row justify-between items-center w-full ${
        index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
      }`}
      ref={ref}
    >
      <div className="w-full md:w-5/12"></div>

      <motion.div
        className="relative w-full md:w-5/12 min-h-[256px] max-h-[400px] cursor-pointer perspective"
        initial="hidden"
        animate={controls}
        variants={variants}
        onClick={() => setFlipped(!flipped)}
      >
        <motion.div
          className="absolute w-full h-full transition-transform duration-700 transform-style preserve-3d"
          animate={{ rotateY: flipped ? 180 : 0 }}
        >
          {/* Front */}
          <div className="absolute w-full h-full backface-hidden bg-white border-l-4 border-[#A3C4F3] shadow-lg rounded-lg p-6 overflow-auto">
            <p className="text-sm text-[#999]">{item.duration}</p>
            <h3 className="text-xl font-semibold text-[#333]">{item.title}</h3>
            <p className="text-[#777] font-medium">{item.company}</p>
            <p className="mt-2 text-[#555]">{item.description}</p>
            <p className="mt-3 text-sm text-[#A3C4F3]">Click to learn more</p>
          </div>

          {/* Back */}
          <div className="absolute w-full h-full backface-hidden bg-[#FDF6F0] border-l-4 border-[#F9AFAE] shadow-lg rounded-lg p-6 rotate-y-180 overflow-auto">
            <h4 className="text-lg font-semibold text-[#333]">What I Did</h4>
            <ul className="mt-2 list-disc list-inside text-[#555] text-sm space-y-1">
              {item.details.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-[#F9AFAE]">Click to go back</p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default function ExperienceTimeline() {
  return (
    <section id="experience" className="py-16 bg-[#FDF6F0]">
      <h2 className="text-3xl font-bold text-center mb-12 text-[#333]">
        Experience
      </h2>
      <div className="relative max-w-5xl mx-auto">
        {/* Vertical Line */}
        <div className="absolute left-1/2 transform -translate-x-1/2 h-full w-1 bg-[#A3C4F3]"></div>

        {experienceData.map((item, index) => (
          <TimelineCard key={index} item={item} index={index} />
        ))}
      </div>
    </section>
  );
}
