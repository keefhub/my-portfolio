# UX Refresh — Implementation Plan

> **Date:** May 11, 2026
> **Principle:** Keep all content intact. Redesign the experience layer — spacing, motion, depth, and color treatment — to create a polished, modern portfolio that feels premium without changing a single word of copy.

---

## Design System Refinements

### 1. Color Palette — Add Depth

- Introduce `--surface-alt` and `--accent-blue-light`/`--accent-rose-light` for depth layers
- Dark mode: refine contrast ratios, add subtle surface layering
- Gradient accents: replace flat accent colors with subtle gradient stops

### 2. Typography

- Already strong with Geist. Add tighter letter-spacing for headings, looser for body
- Add a decorative gradient text treatment for the hero name

### 3. Spacing

- Replace hardcoded `py-16`/`py-20` with design-token-driven spacing
- Add section dividers (subtle wave or diagonal transitions)

### 4. Motion

- Replace raw Framer Motion variants with reusable animation presets
- Add scroll-driven parallax to hero background blobs
- Smooth section entrance with staggered children
- Cursor glow / spotlight effect on hero (subtle)

---

## Component-by-Component Changes

### Header (`header.tsx`)

- **Glassmorphism:** Add `backdrop-blur` + semi-transparent bg on scroll
- **Active indicator:** Animated underline pill instead of just color change
- **Mobile menu:** Slide-down with backdrop blur overlay
- **Theme toggle:** Smooth icon rotation transition

### Hero (`hero.tsx`)

- **Background:** Floating animated orbs/blobs (CSS-only, no JS overhead)
- **Name:** Gradient text (accent-blue → accent-rose)
- **Tagline:** Typewriter-like reveal or staggered word animation
- **CTAs:** Add glowing ring effect on hover
- **Social icons:** Floating entrance, stagger delay per icon
- **Scroll indicator:** Pulsing ring + bounce arrow

### About Me (`aboutme.tsx`)

- **Image:** Add decorative background shape (rotated rounded square behind image)
- **Text:** Fade-in staggered paragraphs
- **Add personal stats row** (years exp, projects count, coffee cups 😄) — _actually, no, keep content!_
- Just enhance the image frame with a glowing border and floating decoration

### Experience Timeline (`experienceTimeLine.tsx`)

- **Vertical line:** Gradient (accent-blue → accent-rose) with animated dash
- **Cards:** Tilt on hover (subtle 3D), glassmorphism surface
- **Flip:** Smoother 3D perspective with shadow depth change
- **Year badge:** Floating pill on the timeline instead of inline

### Tech Stack (`techstack.tsx`)

- **Category cards:** Glassmorphism containers with hover lift
- **Icons:** Floating entrance with stagger, bounce on hover
- **Add proficiency indicator:** Subtle dot indicators under each icon

### Projects (`project.tsx`)

- **Card grid:** Masonry-like staggered layout
- **Tags:** Pill-shaped with gradient border
- **Flip:** Card lifts on hover, 3D perspective deepen

### Certifications (`certifications.tsx`)

- **Cards:** Horizontal scroll snap on mobile, grid on desktop
- **Badge images:** Subtle glow ring on hover
- **Links:** Animated underline reveal

### Footer (`footer.tsx`)

- **Add subtle top gradient separator**
- **Social icons:** Larger touch targets, ring hover effect
- **Back to top:** Floating FAB that appears on scroll

---

## Implementation Order

1. `globals.css` — New design tokens, utilities
2. `layout.tsx` — Skip-to-content, smooth scrolling
3. `header.tsx` — Glassmorphism + animations
4. `hero.tsx` — Gradient name, blob background, staggered socials
5. `aboutme.tsx` — Decorative frame, staggered text
6. `experienceTimeLine.tsx` — 3D tilt, gradient timeline
7. `techstack.tsx` — Glass cards, hover effects
8. `project.tsx` — Enhanced flip, pill tags
9. `certifications.tsx` — Glow rings, scroll snap
10. `footer.tsx` — FAB, gradient separator
