import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <h1 className="text-6xl font-bold">404</h1>
      <h2 className="text-xl">This page could not be found.</h2>
      <Link href="/" className="underline" style={{ color: "var(--accent-blue)" }}>
        Back to the site
      </Link>
      <Link href="/blog/" className="underline" style={{ color: "var(--accent-blue)" }}>
        Back to the blog
      </Link>
    </main>
  );
}
