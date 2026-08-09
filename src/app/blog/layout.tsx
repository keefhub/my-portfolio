import Header from "../components/header";
import Footer from "../components/footer";

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main id="main-content" className="pt-20 bg-[var(--background)]">
        {children}
      </main>
      <Footer />
    </>
  );
}
