# my-portfolio — AI Agent Reference

> Deep reference, read on demand. For the always-loaded summary — commands,
> invariants, conventions, skill routing — see [CLAUDE.md](CLAUDE.md).

## Project Identity

| Key           | Value                                                   |
| ------------- | ------------------------------------------------------- |
| **Domain**    | Portfolio / resume site                                 |
| **URL**       | `https://thegoldenpothos.dev`                           |
| **Framework** | Next.js 16.2.6 (App Router) + React 19                  |
| **Styling**   | Tailwind CSS v4 + CSS custom properties (design tokens) |
| **Animation** | Framer Motion 12.7                                      |
| **Icons**     | lucide-react 0.503                                      |
| **Fonts**     | Geist (sans), Geist Mono (via `next/font`)              |
| **Content**   | Markdown blog in `content/blog/`, built by unified/remark/rehype |
| **Deploy**    | Firebase Hosting (static export via `next build`)       |
| **Output**    | `output: "export"` + `trailingSlash: true` → `./out/`   |

---

## Architecture

### Route Map

All routes are prerendered at build time — there is no server at runtime.

| URL             | Source                        | Notes                             |
| --------------- | ----------------------------- | --------------------------------- |
| `/`             | `src/app/page.tsx`            | Multi-section scroll landing page |
| `/blog/`        | `src/app/blog/page.tsx`       | Post index                        |
| `/blog/<slug>/` | `src/app/blog/[slug]/page.tsx`| `generateStaticParams` per post   |
| `/rss.xml`      | `src/app/rss.xml/route.ts`    | `dynamic = "force-static"`        |
| `/sitemap.xml`  | `src/app/sitemap.ts`          | Next metadata route               |
| `/robots.txt`   | `src/app/robots.ts`           | Next metadata route               |

### Landing Page (`/`)

```
page.tsx            ← multi-section scroll, anchor-linked (not routed)
├── Header          ← sticky nav + scrollspy + mobile drawer + theme toggle
├── Hero            ← fullscreen landing with social links + CTA
├── AboutMe         ← bio text + profile photo
├── ExperienceTimeline ← alternating timeline with flip cards
├── TechStack       ← category grid of tool icons
├── Projects        ← project grid with flip cards
├── Certifications  ← link badges
└── Footer          ← social links + back-to-top FAB
```

### Blog (`/blog`)

```
blog/layout.tsx     ← shared blog chrome
├── blog/page.tsx        → BlogIndex → BlogCard[]   (server components)
└── blog/[slug]/page.tsx → BlogArticle              (server component)
        ↑ content sourced from content/blog/*.md at build time
```

### Data Flow

```
User scrolls → IntersectionObserver (ScrollSpy) → Header activeSection state
User clicks nav link → scrollIntoView({ behavior: "smooth" })
User flips card → useState<Set<number>>(flippedCards) → toggle via rotateY(180deg)
User toggles theme → ThemeContext → localStorage + data-theme attr on <html>
```

### Key Architectural Decisions

- **Landing page is anchor-scrolled, the blog is routed**: `/` is one page of sections; `/blog` and `/blog/<slug>` are real routes
- **Mixed server/client components**: 8 of 17 are `"use client"`. The landing-page sections are client (animation + state); the blog tree and metadata routes are server components
- **Static export**: `output: "export"`. No API routes, no middleware, no ISR, no request-time rendering. Dynamic routes need `generateStaticParams`; route handlers need `dynamic = "force-static"`
- **`trailingSlash: true`**: Emits `out/blog/<slug>/index.html`. Firebase Hosting serves exact-match files only, so the flat `.html` form left every blog URL unmatched. Coupled to `firebase.json` and `absoluteUrl()` in `src/lib/site.ts` — change all three together
- **Build-time content pipeline**: Markdown in `content/blog/` is read, validated, and rendered during `next build` — never at runtime
- **CSS variables for theming**: Light/dark tokens in `:root` / `[data-theme="dark"]`
- **Flip cards**: Used in both Experience and Projects for progressive disclosure

---

## Frontend / UI

### Component Tree

```
RootLayout
├── inline <script> (FOUC prevention for dark mode)
├── ThemeProvider (Context + localStorage sync)
└── Home (page)
    ├── Skip-to-content link (<a href="#main-content">)
    ├── Header
    │   ├── Brand logo (🌿 thegoldenpothos)
    │   ├── Desktop nav links [About, Experience, Projects, Certifications]
    │   ├── Dark mode toggle button (Sun/Moon icon)
    │   └── Mobile hamburger → AnimatePresence drawer
    ├── Hero
    │   ├── Animated background orbs (CSS blur + float animation)
    │   ├── Greeting, Name (gradient text), Tagline
    │   ├── CTAs ["View My Work" → #projects, "About Me" → #about]
    │   └── Social links [GitHub, LinkedIn, Email, Resume PDF]
    ├── AboutMe
    │   ├── Bio paragraph (left)
    │   └── Profile image with decorative rings + accent dots (right)
    ├── ExperienceTimeline
    │   ├── Alternating left/right cards (desktop), linear (mobile)
    │   ├── Vertical gradient line (blue→rose→blue)
    │   └── Each card: front (summary) / back (details) via flip
    ├── TechStack
    │   └── 4-column category grid: Frontend, Backend, Database, Languages
    ├── Projects
    │   └── 3-column flip-card grid (responsive: 1→2→3 cols)
    ├── Certifications
    │   └── 3-column badge grid (glass effect, hover scale, link to credential)
    └── Footer
        ├── Brand + copyright
        ├── Social links
        └── Back-to-top FAB (AnimatePresence, scroll threshold 400px)
```

### Navigation Flow

```
#hero (default)
  ↓ Scroll / Nav click
#about → #experience → #projects → #certifications
                                     ↓ Footer
              ↺ Scroll-to-top FAB → #hero
```

### User Interactions

| Trigger                       | Action                                              | Feedback                   |
| ----------------------------- | --------------------------------------------------- | -------------------------- |
| Scroll past 20px              | Header gets `glass` + shadow                        | 400ms transition           |
| Click nav link                | Scroll spy updates active pill                      | Spring animation on pill   |
| Click theme toggle            | `localStorage.setItem("theme")` + `data-theme` attr | 180° rotate icon           |
| Click project/experience card | Card flips (front↔back)                             | 3D rotateY(700ms)          |
| Hover tech icon               | Icon lifts + scales up                              | 250ms transition           |
| Hover cert badge              | Badge scales up, "View Credential" fades in         | 300ms transition           |
| Scroll past 400px             | Back-to-top FAB appears                             | AnimatePresence Fade+Scale |
| Resize < 768px                | Desktop nav → hamburger menu                        | 250ms slide-down drawer    |

---

## Backend / API

**No runtime backend.** No database, no authentication, no request-time server
logic. But there *is* a build-time data layer — see the Blog Subsystem section
below.

Portfolio data is embedded as TypeScript constants in each component file:

- `projects[]` in `project.tsx`
- `experienceData[]` in `experienceTimeLine.tsx`
- `techStack[]` in `techstack.tsx`
- `certifications[]` in `certifications.tsx`
- `socialLinks[]` in `hero.tsx` and `footer.tsx`

Blog data comes from Markdown files in `content/blog/`, loaded at build time.

---

## Blog Subsystem

### Pipeline

```
content/blog/*.md
  ↓ fs.readdirSync + gray-matter          (src/lib/blog/posts.ts, server-only)
  ↓ validateFrontmatter — throws on bad input, failing the build
  ↓ sort newest-first, memoize (production only)
  ↓ unified pipeline                       (src/lib/blog/markdown.ts)
  →  HTML rendered into BlogArticle at build time
```

### Modules (`src/lib/blog/`)

| File          | Role                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| `types.ts`    | `BlogFrontmatter`, `BlogPost`, `BlogPostLite`, `formatDate()`. **Client-safe.** |
| `posts.ts`    | `import "server-only"`. Reads the filesystem. Loading, validation, reading time. |
| `markdown.ts` | `markdownToHtml()` — the unified/remark/rehype pipeline                      |
| `rss.ts`      | `generateRssFeed()`                                                         |
| `index.ts`    | Barrel. **Server-only by transitivity** — re-exports `posts.ts`.            |

> **Import rule:** client components import from `@/lib/blog/types` only.
> Importing the `@/lib/blog` barrel from a `"use client"` file drags `fs` into
> the browser bundle and fails the build.

### Frontmatter

Required: `title`, `excerpt`, `date` (`YYYY-MM-DD`), `slug`.
Optional: `updated`, `tags`, `draft`, `featured`, `coverImage`, `coverAlt`, `readingTime`.

The build **fails loudly** on a missing/empty required field, a non-string
required field, an unparseable date, or a duplicate slug across files.

### Behaviors worth knowing

- **`readingTime` is computed** from the body (200 wpm, fenced code stripped) when
  omitted. Prefer omitting it so it cannot drift from the content.
- **`draft: true`** removes a post from listings, its detail page, RSS, and the sitemap.
- **The memo cache is production-only.** In `next dev` the Markdown files are not
  module dependencies, so caching would serve stale content until a server restart.
- **`formatDate()` pins `timeZone: "UTC"`.** Without it, build-time HTML and the
  client re-render disagree across timezone boundaries → hydration mismatch.
- **Raw HTML in posts is trusted** and parsed by `rehype-raw` into real elements.
  If untrusted Markdown is ever rendered, add `rehype-sanitize` after `rehype-raw`.

### List vs. detail

`getPublishedPosts()` and `getFeaturedPosts()` return `BlogPostLite` — the post
*without* its Markdown body — so list views never ship article content. Only
`getPostBySlug()` carries `content`.

---

## State & Data

### React State (all local, per component)

| Component            | State           | Type                | Purpose                         |
| -------------------- | --------------- | ------------------- | ------------------------------- |
| `Header`             | `activeSection` | `string`            | Current section from ScrollSpy  |
| `Header`             | `isOpen`        | `boolean`           | Mobile menu open/closed         |
| `Header`             | `scrolled`      | `boolean`           | Scroll > 20px (glass effect)    |
| `Projects`           | `flippedCards`  | `Set<number>`       | Which cards are flipped         |
| `ExperienceTimeline` | `flipped`       | `boolean`           | Per-card flip state             |
| `Footer`             | `showFab`       | `boolean`           | Scroll > 400px (FAB visibility) |
| `ThemeProvider`      | `theme`         | `"light" \| "dark"` | Current theme                   |

### Persistence

| Data             | Storage        | Key       |
| ---------------- | -------------- | --------- |
| Theme preference | `localStorage` | `"theme"` |

### Data Models

```typescript
interface Project {
  title: string;
  shortDesc: string;
  description: string[];
  tech: string[];
  github: string;
  demo: string;
}

interface ExperienceItem {
  year: string;
  title: string;
  company: string;
  duration: string;
  description: string;
  details: string[];
}

interface TechCategory {
  category: string;
  tools: Tool[];
}
interface Tool {
  name: string;
  icon: string;
}

interface Certification {
  name: string;
  icon: string;
  url: string;
}
```

---

## CSS / Styling Architecture

### Design Tokens (CSS Custom Properties)

| Token Group     | Variables                                                      | Used By                          |
| --------------- | -------------------------------------------------------------- | -------------------------------- |
| **Background**  | `--background`, `--background-alt`                             | Page, sections                   |
| **Foreground**  | `--foreground`, `--foreground-soft`, `--muted`, `--muted-soft` | Text hierarchy                   |
| **Accent Blue** | `--accent-blue`, `--accent-blue-light`, `--accent-blue-subtle` | Primary UI, links, active states |
| **Accent Rose** | `--accent-rose`, `--accent-rose-light`, `--accent-rose-subtle` | Secondary accent, bullets        |
| **Surfaces**    | `--surface`, `--surface-alt`, `--surface-elevated`             | Cards, glass elements            |
| **Borders**     | `--border`, `--border-strong`                                  | Dividers, card borders           |
| **Shadows**     | `--shadow-sm/md/lg`, `--shadow-glow-blue/rose`                 | Elevation, hover glows           |
| **Radii**       | `--radius-sm/md/lg/xl/2xl`                                     | Card and button rounding         |

### Utility Classes (in `globals.css`)

| Class                                                                    | Purpose                                  |
| ------------------------------------------------------------------------ | ---------------------------------------- |
| `.glass`                                                                 | Backdrop blur + translucent surface      |
| `.card-flip` / `.card-flip-container`                                    | 3D flip card wrapper                     |
| `.card-front` / `.card-back`                                             | Flip card faces                          |
| `.preserve-3d`, `.perspective-1000`, `.backface-hidden`, `.rotate-y-180` | 3D transform helpers                     |
| `.gradient-text`                                                         | Animated blue→rose gradient on text      |
| `.animate-fade-in-up`, `.animate-fade-in`, `.animate-float`              | Pre-defined keyframe classes             |
| `.stagger-children > *`                                                  | Staggered child animation (up to 8)      |
| `.section-divider`                                                       | Gradient line separator between sections |
| `.skip-link`                                                             | Accessibility skip-to-content            |
| `.animate-gradient-shift`                                                | Animated background gradient             |

### Keyframe Animations

`fadeInUp`, `fadeInDown`, `fadeIn`, `float`, `pulse-glow`, `shimmer`, `gradient-shift`, `orbit`

---

## Accessibility Features

- Skip-to-content link (`page.tsx`)
- `aria-label` on all interactive elements
- `aria-expanded` on flip cards and mobile menu
- `aria-controls="mobile-menu"` on hamburger
- Keyboard navigation on cards (`Enter`/`Space` to flip)
- `Esc` closes mobile menu
- `prefers-reduced-motion` media query disables all animations
- `*:focus-visible` global focus ring
- Semantic HTML: `<header>`, `<nav>`, `<main>`, `<footer>`, `<section>`
- `role="banner"`, `role="navigation"`, `role="menu"`, `role="button"`
- Body scroll locked when mobile menu open

---

## Extension Points

### Adding a New Section

1. Create a new component file in `src/app/components/` (e.g., `testimonials.tsx`)
2. Import and mount it in `src/app/page.tsx` within `<main>`, wrapped in a `<section>` with an `id`
3. Add the section `id` to the `sections` array in `header.tsx` for ScrollSpy + nav link
4. If adding data, define the interface locally or in a shared types file (`src/types/`)
5. Follow existing patterns: Framer Motion `whileInView` + `viewport={{ once: true }}` for scroll animations

### Adding a New Project

Edit `projects[]` in `src/app/components/project.tsx`:

```typescript
{
  title: "My New Project",
  shortDesc: "One-liner for card front.",
  description: [
    "Problem: ...",
    "Solution: ...",
  ],
  tech: ["React", "Node.js"],
  github: "https://github.com/user/repo",
  demo: "https://demo.com",
}
```

### Adding a Blog Post

1. Create `content/blog/<slug>.md`
2. Frontmatter must include `title`, `excerpt`, `date` (`YYYY-MM-DD`), and `slug`
   — `slug` must match the filename and be unique across all posts
3. Omit `readingTime` so it is computed from the body
4. Set `draft: true` to keep it out of listings, RSS, and the sitemap until ready
5. Set `featured: true` to surface it via `getFeaturedPosts()`
6. Run `npm run build` — frontmatter is validated there, and a bad post fails the build

No registration step: the loader globs the directory, and `generateStaticParams`
picks the post up automatically.

### Adding a New Certification

Edit `certifications[]` in `src/app/components/certifications.tsx`:

```typescript
{
  name: "AWS Certified Developer",
  icon: "/certs/aws.png",  // place PNG in public/certs/
  url: "https://credential.url",
}
```

### Adding a New Tech Stack Category

Edit `techStack[]` in `src/app/components/techstack.tsx`:

```typescript
{
  category: "DevOps",
  tools: [
    { name: "Docker", icon: "/icons/docker.png" },  // place PNG in public/icons/
  ],
}
```

### Adding a New Experience Entry

Edit `experienceData[]` in `src/app/components/experienceTimeLine.tsx` — follows the same pattern.

### Adding Dark Mode Enhancements

Update `[data-theme="dark"]` block in `globals.css` to add new token overrides.

### Performance Patterns

- **Image loading**: Use `next/image` with `sizes` attribute + `priority` for above-fold
- **IntersectionObserver**: ScrollSpy uses rootMargin to avoid premature triggers
- **Animation triggers**: `whileInView` + `viewport={{ once: true }}` prevents re-animation
- **Body scroll lock**: Applied only when mobile menu open to prevent background scroll

### Conventions

| Convention         | Standard                                                       |
| ------------------ | -------------------------------------------------------------- |
| File naming        | `kebab-case.tsx` for components                                |
| Exports            | `export default function ComponentName()`                      |
| Client components  | `"use client"` directive at top                                |
| CSS                | Tailwind utility classes + CSS vars for design tokens          |
| Imports path alias | `@/*` → `./src/*`                                              |
| Animations         | Framer Motion `motion.div` + CSS `@keyframes` for simple loops |
| Responsive         | Mobile-first, breakpoints: `sm:640` `md:768` `lg:1024`         |

---

## Deployment

```
next build          → static export to ./out/
firebase deploy     → deploys ./out/ to Firebase Hosting
```

`next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true, // → out/blog/<slug>/index.html (Firebase needs exact-match files)
  images: { unoptimized: true },
};
```

`firebase.json` mirrors it with `"trailingSlash": true` and `"cleanUrls": false`,
plus an explicit `application/rss+xml` Content-Type header for `/rss.xml`.
`absoluteUrl()` in `src/lib/site.ts` appends the same trailing slash to canonical,
OG, RSS, and sitemap URLs — while deliberately *not* slashing file paths like
`/rss.xml`. These three must stay in agreement.

---

## Known Limitations

| Issue                                          | Impact                                       |
| ---------------------------------------------- | -------------------------------------------- |
| All landing-page sections are `"use client"`   | Larger JS bundle on `/` than the blog routes |
| Images unoptimized (static export constraint)  | No WebP/AVIF, no responsive srcset           |
| No loading / error boundaries                  | No fallback UI for failures                  |
| No analytics                                   | No visitor insights                          |
| Portfolio data embedded in components          | Harder to maintain as data grows             |
| No search / filtering on projects or posts     | Fine at current volume, may not scale        |
| No page transitions                            | Hard page jump between sections              |
| No tests                                       | `npm run build` is the only safety net       |
| `ThemeProvider` trips `set-state-in-effect`    | `npm run lint` exits 1 on a clean tree       |
