// components/Footer.js
export default function Footer() {
  return (
    <footer className="bg-[#FDF6F0] py-6 mt-12 shadow-inner">
      <div className="max-w-7xl mx-auto px-4 text-center text-sm text-[#555]">
        <p>© {new Date().getFullYear()} Keith Lim. All rights reserved.</p>
        <div className="mt-2 flex justify-center space-x-4">
          <a
            href="https://github.com/keefhub"
            className="hover:text-[#A3C4F3]"
            target="_blank"
          >
            GitHub
          </a>
          <a
            href="https://linkedin.com/in/yylim-keith"
            className="hover:text-[#A3C4F3]"
            target="_blank"
          >
            LinkedIn
          </a>
        </div>
      </div>
    </footer>
  );
}
