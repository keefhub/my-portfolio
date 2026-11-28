# my-portfolio — AI Agent Reference

> Deep reference, read on demand. For the always-loaded summary — commands,
> invariants, conventions, skill routing — see [CLAUDE.md](CLAUDE.md).

## Project Identity

| Key           | Value                                                   |
| ------------- | ------------------------------------------------------- |
| **Domain**    | Portfolio / resume site                                 |
| **URL**       | `https://thegoldenpothos.xyz`                           |
| **Framework** | Next.js 16.2.6 (App Router) + React 19                  |
| **Styling**   | Tailwind CSS v4 + CSS custom properties (design tokens) |
| **Animation** | Framer Motion 12.7                                      |
| **Icons**     | lucide-react 0.503                                      |
| **Fonts**     | Geist (sans), Geist Mono (via `next/font`)              |
| **Content**   | Markdown blog in `content/blog/`, built by unified/remark/rehype |
| **Deploy**    | Vercel (Git integration; public pages prerendered, sign-in and the panel on the server) |
| **Output**    | `trailingSlash: true`; public pages prerendered, no separate export folder |

---

## Architecture

### Route Map

The public routes are prerendered at build time. The admin panel, `/api/auth/*` and `/api/admin/*` run on the server.

| URL             | Source                        | Notes                             |
| --------------- | ----------------------------- | --------------------------------- |
| `/`             | `src/app/page.tsx`            | Multi-section scroll landing page |
| `/blog/`        | `src/app/blog/page.tsx`       | Post index                        |
| `/blog/<slug>/` | `src/app/blog/[slug]/page.tsx`| `generateStaticParams` per post   |
| `/rss.xml`      | `src/app/rss.xml/route.ts`    | `dynamic = "force-static"`        |
| `/sitemap.xml`  | `src/app/sitemap.ts`          | Next metadata route               |
| `/robots.txt`   | `src/app/robots.ts`           | Next metadata route               |
| `/bright-warm-greenhouse/` | `src/app/bright-warm-greenhouse/page.tsx` | Owner-only admin panel; `noindex`; renders `AdminPanel` |
| `/api/auth/*`   | `src/app/api/auth/[...nextauth]/route.ts` | The Auth.js handlers; dynamic.    |
| `/api/admin/*`  | `src/app/api/admin/**`        | The owner-only JSON routes and the one public published-posts read; dynamic. |

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
    └── PostBody (blog/PostBody.tsx, hookless; the .prose wrapper, also used by the admin preview)
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
- **Prerendered public pages**: no middleware, no ISR. Dynamic public routes need `generateStaticParams` and `dynamicParams = false`; public route handlers stay `dynamic = "force-static"`. Only sign-in (`/api/auth/*`) and the panel (`/api/admin/*` and the panel page) are dynamic
- **`trailingSlash: true`**: Each route is emitted as a directory (`blog/<slug>/`) and the host redirects the unslashed form to the slashed one. Coupled to `vercel.json` and `absoluteUrl()` in `src/lib/site.ts` — change all three together
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

Admin panel (`/bright-warm-greenhouse/`, separate from the landing page):

```
AdminPanel ("use client", src/app/components/admin/AdminPanel.tsx)
├── loading screen (first render, avoids hydration mismatch)
├── signed-out: "Sign in with Google" form (Auth.js) + failure alert
├── signed-in, not allowed: message, Sign out
└── signed-in, owner: section menu, Sign out
    └── PublishButton (src/app/components/admin/PublishButton.tsx), under the "Admin" heading above the section
        menu: POST /api/admin/publish/ via publishSite() (src/lib/admin/publish.ts); "Publishing…" while it runs,
        then a status or an alert message; one press at a time
    └── ImageLibrary (src/app/components/admin/ImageLibrary.tsx), the "Images" menu item: upload
        (PNG/JPEG/WebP/SVG, at most 5 MB), newest-first list with size, Copy address, inline Confirm delete
    └── ProfileEditor (src/app/components/admin/ProfileEditor.tsx), the "Profile" menu item: one form for
        name, headline, about paragraphs, photo (uploaded image or repo path), email, resume link, social links;
        errors beside fields; the form pattern the later editors reuse
    └── ExperienceEditor (src/app/components/admin/ExperienceEditor.tsx), the "Experience" menu item: the
        fields for one entry, inside the shared ListEditor<T> (ListEditor.tsx: list ordered by position, Add
        entry, Edit, Move up/down, inline Confirm delete, one write at a time) with shared form pieces in
        formParts.tsx. Projects, certifications and tech stack reuse ListEditor with their own fields.
    └── ProjectsEditor (src/app/components/admin/ProjectsEditor.tsx), the "Projects" menu item: ListEditor with
        title, short description, paragraphs, tech names, GitHub and demo links; new projects are added last
        (ListEditor's optional emptyText, listLabel and newPosition props)
    └── CertificationsEditor (src/app/components/admin/CertificationsEditor.tsx), the "Certifications" menu
        item: ListEditor (addLabel "Add certification") with name, credential link and badge (uploaded image or
        repo path, via the profile's photoSelection)
    └── TechStackEditor (src/app/components/admin/TechStackEditor.tsx), the "Tech stack" menu item: ListEditor of
        categories (rowDetails lists each item), each with items {name, icon} edited in the form; item moves are
        stored on Save, a confirmed item removal in an edit form saves at once (ListEditor's saveNow)
    └── BlogPostsEditor (src/app/components/admin/BlogPostsEditor.tsx), the "Blog posts" menu item: ListEditor
        (not movable; ordered by date, newest first) over a slug-keyed create-only store; markdown body, title,
        excerpt, date, tags, Draft/Published, featured, cover image (uploaded or path) and alt text; a taken slug
        is refused and nothing is overwritten
        └── PostPreview (src/app/components/admin/PostPreview.tsx): "Preview" in the post form swaps the fields
            for the body rendered by @/lib/markdown inside PostBody (the same converter the blog uses through
            src/lib/blog/markdown.ts); "Back to form" returns with nothing lost or saved (ListEditor's hideFormActions)
```

Styled with inline `var(--token)` values only; the panel code imports `src/lib/admin` (the server modules in
`src/lib/server` are reached only through the API routes), and no public page may import these modules.

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

**The public pages read only the repository** (`content/blog/` and the component constants below); see the
Blog Subsystem section for the build-time data layer. The server pieces serve the owner's panel only:

- Sign-in is Auth.js; the owner is the verified Google email in `ADMIN_EMAIL`.
- The owner-only routes under `/api/admin/` check the owner before any database or storage call.
- Content is stored in Supabase PostgreSQL, reached with `postgres`; uploaded images live in Supabase Storage, reached with `fetch`.
- The test run uses stand-ins for Google and for Supabase.

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
next build          → public pages prerendered; panel and sign-in routes dynamic
git push            → Vercel builds (vercel.json: `npm run build`) and deploys
```

`master` is Vercel's production branch (thegoldenpothos.xyz); `develop` is served at
sit.thegoldenpothos.xyz (a domain assigned to that branch). Other branches get preview URLs, which the
admin panel treats as SIT (any host that is neither production nor local, `environmentFor()`).
Sign-in does not work on preview addresses, because Google allows fixed return addresses only.

`next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  trailingSlash: true, // each route is emitted as a directory (blog/<slug>/)
  images: { unoptimized: true },
};
```

`vercel.json` mirrors it with `"trailingSlash": true` and `"cleanUrls": false`,
plus an explicit `application/rss+xml` Content-Type header for `/rss.xml`.
`absoluteUrl()` in `src/lib/site.ts` appends the same trailing slash to canonical,
OG, RSS, and sitemap URLs — while deliberately *not* slashing file paths like
`/rss.xml`. These three must stay in agreement.

---

## Known Limitations

| Issue                                          | Impact                                       |
| ---------------------------------------------- | -------------------------------------------- |
| All landing-page sections are `"use client"`   | Larger JS bundle on `/` than the blog routes |
| Images unoptimized (free-plan constraint, CLAUDE.md Invariant 6) | No WebP/AVIF, no responsive srcset           |
| No loading / error boundaries                  | No fallback UI for failures                  |
| No analytics                                   | No visitor insights                          |
| Portfolio data embedded in components          | Harder to maintain as data grows             |
| No search / filtering on projects or posts     | Fine at current volume, may not scale        |
| No page transitions                            | Hard page jump between sections              |
| No tests                                       | `npm run build` is the only safety net       |
| `ThemeProvider` trips `set-state-in-effect`    | `npm run lint` exits 1 on a clean tree       |
