"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

const sections = ["about", "experience", "projects", "certifications"];

export default function Navbar() {
  const [activeSection, setActiveSection] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // ScrollSpy using IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0.2 }
    );

    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const linkClasses = (id) =>
    `hover:text-[#A3C4F3] transition ${
      activeSection === id ? "text-[#A3C4F3] font-semibold" : "text-[#555]"
    }`;

  return (
    <nav className="bg-[#FDF6F0] shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        {/* Desktop Menu */}
        <ul className="hidden md:flex space-x-6">
          {sections.map((id) => (
            <li key={id}>
              <a href={`#${id}`} className={linkClasses(id)}>
                {id.charAt(0).toUpperCase() + id.slice(1)}
              </a>
            </li>
          ))}
        </ul>

        {/* Mobile Menu Button */}
        <div className="md:hidden">
          <button onClick={() => setIsOpen(!isOpen)} className="text-[#333]">
            {isOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <ul className="md:hidden flex flex-col space-y-4 px-6 pb-4 text-[#555] bg-[#FDF6F0]">
          {sections.map((id) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className={linkClasses(id)}
                onClick={() => setIsOpen(false)} // Close on click
              >
                {id.charAt(0).toUpperCase() + id.slice(1)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
