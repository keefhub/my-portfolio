import Header from "./components/header";
import Hero from "./components/hero";
import Footer from "./components/footer";
import ExperienceTimeline from "./components/experienceTimeLine";
import TechStack from "./components/techstack";
import Certifications from "./components/certifications";
import Projects from "./components/project";
import AboutMe from "./components/aboutme";
import { loadPublishedProfile } from "@/lib/server/publicProfile";
import { loadPublishedExperience } from "@/lib/server/publicExperience";
import { contactLinks, showsAbout } from "@/lib/publicProfile";

export const revalidate = false;

export default async function Home() {
  const profile = await loadPublishedProfile();
  const entries = await loadPublishedExperience();
  const about = profile !== null && showsAbout(profile);
  return (
    <>
      {/* Skip-to-content for keyboard users */}
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <Header showAbout={about} />
      {profile && <Hero profile={profile} hasAbout={about} />}

      <main id="main-content" className="bg-[var(--background)] overflow-x-clip">
        {about && profile && (
          <section id="about" className="py-24 md:py-32 section-divider">
            <AboutMe profile={profile} />
          </section>
        )}

        <section id="experience" className="py-24 md:py-32 section-divider">
          {entries.length > 0 && <ExperienceTimeline entries={entries} />}
          <TechStack />
        </section>

        <section id="projects" className="py-24 md:py-32 section-divider">
          <Projects />
        </section>

        <section id="certifications" className="py-24 md:py-32">
          <Certifications />
        </section>
      </main>

      <Footer
        name={profile?.name}
        links={profile ? contactLinks(profile, false) : []}
      />
    </>
  );
}
