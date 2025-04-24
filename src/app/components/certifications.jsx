import Image from "next/image";

const certifications = [
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
    <section id="certifications" className="py-16">
      <h2 className="text-3xl font-bold text-center mb-12 text-[#333]">
        Certifications
      </h2>
      <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-8 px-4">
        {certifications.map((cert, index) => (
          <a
            key={index}
            href={cert.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center p-4 bg-white shadow-md rounded-xl hover:shadow-lg transition-shadow hover:scale-105"
          >
            <Image
              src={cert.icon}
              alt={cert.name}
              width={64}
              height={64}
              className="w-16 h-16 object-contain mb-2"
            />
            <p className="text-center text-sm font-medium text-[#333]">
              {cert.name}
            </p>
            <p className="text-xs text-[#888] mt-1">View Credential</p>
          </a>
        ))}
      </div>
    </section>
  );
}
