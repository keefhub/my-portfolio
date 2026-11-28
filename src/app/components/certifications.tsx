import Image from "next/image";
import type { PublicCertification } from "@/lib/publicCertifications";

const CARD = "group flex flex-col items-center p-6 glass rounded-2xl min-w-0";
const LIFT =
  " hover:shadow-md transition-all duration-300 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] outline-none";

export default function Certifications({
  entries,
}: {
  entries: PublicCertification[];
}) {
  if (entries.length === 0) return null;
  return (
    <section className="py-16">
      <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12 text-[var(--foreground)]">
        Certifications
      </h2>
      <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6 px-4">
        {entries.map((cert, index) => {
          const body = (
            <>
              {cert.icon !== "" && (
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
              )}
              <p className="text-center text-sm font-semibold text-[var(--foreground)] mb-1 min-w-0 max-w-full break-words">
                {cert.name}
              </p>
              {cert.url !== "" && (
                <span className="text-xs text-[var(--accent-blue)] font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  View Credential ↗
                </span>
              )}
            </>
          );
          return cert.url !== "" ? (
            <a
              key={index}
              href={cert.url}
              target="_blank"
              rel="noopener noreferrer"
              className={CARD + LIFT}
            >
              {body}
            </a>
          ) : (
            <div key={index} className={CARD}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
