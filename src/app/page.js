import Header from "./components/header";
import Footer from "./components/footer";
import ExperienceTimeline from "./components/experienceTimeLine";
import TechStack from "./components/techstack";
import Certifications from "./components/certifications";
import Projects from "./components/project";
import AboutMe from "./components/aboutme";

export default function Home() {
  return (
    <main className="bg-[#FDF6F0] min-h-screen">
      <Header />
      <section id="about" className="py-20">
        <AboutMe />
      </section>

      <section id="experience" className="py-20">
        <ExperienceTimeline />
        <TechStack />
      </section>

      <section id="projects" className="py-20">
        <Projects />
      </section>

      <section id="certifications" className="py-20">
        <Certifications />
      </section>

      <Footer />
    </main>
  );
}
