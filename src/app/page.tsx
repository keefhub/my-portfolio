import Header from "./components/header";
import Hero from "./components/hero";
import Footer from "./components/footer";
import ExperienceTimeline from "./components/experienceTimeLine";
import TechStack from "./components/techstack";
import Certifications from "./components/certifications";
import Projects from "./components/project";
import AboutMe from "./components/aboutme";

export default function Home() {
  return (
    <>
      {/* Skip-to-content for keyboard users */}
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <Header />
      <Hero />

      <main id="main-content" className="bg-[var(--background)]">
        <section id="about" className="py-24 md:py-32 section-divider">
          <AboutMe />
        </section>

        <section id="experience" className="py-24 md:py-32 section-divider">
          <ExperienceTimeline />
          <TechStack />
        </section>

        <section id="projects" className="py-24 md:py-32 section-divider">
          <Projects />
        </section>

        <section id="certifications" className="py-24 md:py-32">
          <Certifications />
        </section>
      </main>

      <Footer />
    </>
  );
}
