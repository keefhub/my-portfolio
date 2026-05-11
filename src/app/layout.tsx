import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "thegoldenpothos — Keith Lim | Software Engineer & Portfolio",
    template: "%s | thegoldenpothos",
  },
  description:
    "Software engineer by profession, plant lover, coffee enthusiast, and photographer. Explore Keith Lim's projects, experience, and tech stack.",
  keywords: [
    "Keith Lim",
    "portfolio",
    "software engineer",
    "web developer",
    "full stack",
    "Singapore",
    "React",
    "Next.js",
    "ASP.NET",
  ],
  authors: [{ name: "Keith Lim", url: "https://thegoldenpothos.dev" }],
  creator: "Keith Lim",
  metadataBase: new URL("https://thegoldenpothos.dev"),
  openGraph: {
    title: "thegoldenpothos — Keith Lim",
    description:
      "Software engineer, plant lover, coffee enthusiast. Explore my portfolio.",
    url: "https://thegoldenpothos.dev",
    siteName: "thegoldenpothos",
    locale: "en_SG",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "thegoldenpothos — Keith Lim",
    description:
      "Software engineer, plant lover, coffee enthusiast. Explore my portfolio.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent FOUC for dark mode */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme:dark)").matches)){document.documentElement.setAttribute("data-theme","dark")}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
