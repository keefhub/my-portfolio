---
title: "Building a Portfolio with Next.js and Tailwind CSS"
excerpt: "A walkthrough of how I built this portfolio site using Next.js 15, Tailwind CSS v4, and Framer Motion."
date: "2026-05-20"
slug: "building-portfolio-nextjs"
tags: ["nextjs", "tailwind", "tutorial", "web-dev"]
featured: false
readingTime: 5
---

## Building a Portfolio with Next.js and Tailwind CSS

When I decided to build my portfolio, I knew I wanted three things: **speed**, **simplicity**, and **style**. Here's how Next.js, Tailwind CSS, and Framer Motion delivered on all three.

### The Stack

| Tool                 | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| **Next.js 15**       | Framework — static export, image optimization, routing   |
| **Tailwind CSS v4**  | Styling — utility-first, design tokens via CSS variables |
| **Framer Motion**    | Animations — scroll-triggered, layout transitions        |
| **Firebase Hosting** | Deployment — free, fast, HTTPS by default                |

### Why Static Export?

I chose `output: "export"` in Next.js for a few reasons:

1. **No server costs** — Static files served from a CDN are essentially free.
2. **Blazing fast** — No SSR, no API routes, no cold starts.
3. **Simple deployment** — Just upload the `out/` folder.

```javascript
// next.config.ts
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};
```

### Design System with CSS Variables

I defined design tokens as CSS custom properties, which makes theming and dark mode trivial:

```css
:root {
  --background: #faf8f6;
  --accent-blue: #7eb8da;
  --accent-rose: #e8a0a0;
}

[data-theme="dark"] {
  --background: #0f0f1a;
  --accent-blue: #6498c7;
  --accent-rose: #d48888;
}
```

### Lessons Learned

- **Plan your design tokens early.** They save hours of refactoring later.
- **Use `"use client"` sparingly.** Not every component needs to be client-side.
- **Static export has trade-offs.** No ISR, no API routes, but simpler and cheaper.

That's it! Feel free to check out the [source code on GitHub](https://github.com/keefhub/my-portfolio).
