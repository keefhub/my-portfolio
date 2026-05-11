import Image from "next/image";

interface Certification {
  name: string;
  icon: string;
  url: string;
}

const certifications: Certification[] = [
  {
    name: "Professional Scrum Developer",
    icon: "/certs/scrum.png",
    url: "https://www.credly.com/badges/7d656748-f230-421f-992b-2af88ce8c022/public_url",
  },
  {
    name: "Google IT Automation with Python",
    icon: "/certs/google-python.png",
    url: "https://www.coursera.org/account/accomplishments/specialization/certificate/DGLR364HW5KZ",
  },
  {
    name: "Certified Blockchain Developer",
    icon: "/certs/blockchain.png",
    url: "https://www.credential.net/04477db6-317c-456a-8894-ca7793d41df1#acc.pvAY1jq4",
  },
];

export default function Certifications() {
  return (
    <section className="py-16">
      <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12 text-[var(--foreground)]">
        Certifications
      </h2>
      <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6 px-4">
        {certifications.map((cert) => (
          <a
            key={cert.name}
            href={cert.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center p-6 glass rounded-2xl hover:shadow-md transition-all duration-300 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] outline-none"
          >
            <div className="relative mb-4 transition-transform duration-300 group-hover:scale-110">
              <div className="absolute inset-0 rounded-full bg-[var(--accent-blue-subtle)] blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <Image
                src={cert.icon}
                alt={`${cert.name} certification badge`}
                width={72}
                height={72}
                className="w-16 h-16 object-contain relative"
              />
            </div>
            <p className="text-center text-sm font-semibold text-[var(--foreground)] mb-1">
              {cert.name}
            </p>
            <span className="text-xs text-[var(--accent-blue)] font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              View Credential ↗
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
