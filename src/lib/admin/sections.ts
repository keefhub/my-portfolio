export type AdminSection = { id: string; label: string };

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { id: "profile", label: "Profile" },
  { id: "experience", label: "Experience" },
  { id: "projects", label: "Projects" },
  { id: "certifications", label: "Certifications" },
  { id: "tech-stack", label: "Tech stack" },
  { id: "blog-posts", label: "Blog posts" },
];
