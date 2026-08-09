# UX/UI Improvement Specification — my-portfolio

> **Audit date:** June 2026  
> **Audited by:** Senior UI/UX Engineering Review  
> **Project stack:** Next.js 16, React 19, Tailwind CSS 4, Framer Motion 12

---

## 1. Executive Summary

The portfolio is a static Next.js site (exported via `output: "export"`) with a clean, warm aesthetic, good motion design fundamentals, and solid content structure. However, several accessibility, performance, and visual-polish gaps exist that degrade the overall user experience — particularly for keyboard-only users, screen-reader users, and mobile visitors.

This document catalogs every UX issue found and prescribes concrete fixes, ordered by severity and effort.

---

## 2. Accessibility (Severity: HIGH)

### 2.1 Missing skip-to-content link ❌

| Aspect    | Current | Target                                                                                      |
| --------- | ------- | ------------------------------------------------------------------------------------------- |
| Skip link | None    | A visible-on-focus `<a href="#main-content">Skip to content</a>` at the top of `layout.tsx` |

**Fix:** Add to `layout.tsx`:

```tsx
<a href="#main-content" class="skip-link">
  Skip to content
</a>
```

### 2.2 No visible focus indicators ❌

The CSS global `:focus-visible` rule is missing. Keyboard users have no way to see which element is focused.

**Fix:** Add to `globals.css`:

```css
*:focus-visible {
  outline: 2.5px solid var(--accent-blue);
  outline-offset: 3px;
  border-radius: 4px;
}
*:focus:not(:focus-visible) {
  outline: none;
}
```

### 2.3 Flip cards not keyboard-accessible ❌

Both `experienceTimeLine.tsx` and `project.tsx` use `<div onClick>` on flip cards without:

- `role="button"`
- `tabIndex={0}`
- `onKeyDown` handler
- `aria-expanded`
- `aria-label`

### 2.4 Navigation lacks ARIA landmarks

| Element    | Missing                                  |
| ---------- | ---------------------------------------- |
| `<header>` | `role="banner"`                          |
| `<nav>`    | `role="navigation"` / `aria-label`       |
| `<main>`   | `id="main-content"` for skip-link target |
| `<footer>` | `role="contentinfo"`                     |

---

## 3. Performance (Severity: MEDIUM)

### 3.1 Overuse of `"use client"` ❌

| Component        | Needs `"use client"`? | Fix                                             |
| ---------------- | --------------------- | ----------------------------------------------- |
| `Certifications` | ❌ No hooks           | Remove directive                                |
| `TechStack`      | ❌ Only Framer Motion | Wrap animated portion in a client sub-component |
| `Footer`         | Only for scroll-FAB   | Extract FAB to own client component             |
| `ThemeProvider`  | ✅ Yes                | Keep as-is                                      |
| `AboutMe`        | ❌ Motion only        | Extract animated wrapper                        |

### 3.2 No image lazy-loading

`next/image` with `priority` on above-the-fold hero image is correct, but profile image and cert badges have no `loading="lazy"`.

### 3.3 No `loading.tsx` suspense boundary

The root layout has no `loading.tsx` — if any async render takes time, the entire page goes blank.

---

## 4. Visual Design (Severity: MEDIUM)

### 4.1 No Hero section ❌

The page jumps directly to About Me. A portfolio site needs a strong hero section with:

- Name + tagline
- CTA buttons (View Work / About)
- Social proof (GitHub stars count, LinkedIn followers)
- Scroll-down indicator

### 4.2 Color contrast — body text

| Element                          | Current contrast ratio | Needed      |
| -------------------------------- | ---------------------- | ----------- |
| Body text `#6B6B6B` on `#FDF6F0` | ~4.2:1                 | ≥4.5:1 (AA) |

### 4.3 Dark mode toggle missing ❌

CSS variables for `[data-theme="dark"]` exist but no toggle is implemented. Users are stuck in light mode.

### 4.4 Mobile menu has no animation

The hamburger menu appears/disappears instantly. Should use a smooth slide-in/slide-out with Framer Motion `AnimatePresence`.

### 4.5 Tech Stack section is static

Icons just sit there. Should have a subtle floating/pulse animation and hover scale effect.

---

## 5. SEO & Metadata (Severity: MEDIUM)

### 5.1 No Open Graph / Twitter Card images

The site has no `og:image` or `twitter:image` — shared links look plain.

### 5.2 No robots.txt or sitemap.xml

Static sites should generate these at build time.

### 5.3 No structured data (JSON-LD)

Missing `Person` and `WebSite` schema for rich search results.

---

## 6. Content & Copy (Severity: LOW)

### 6.1 Tagline inconsistency

The tagline "Software engineer by profession — plant lover..." appears both in Hero (once added) and About. It should appear only once, in the hero.

### 6.2 No blog integration

Blog links in header go to `/blog` but there's no blog page or content structure.

---

## 7. Implementation Plan (Priority-Ordered)

| #   | Task                                           | Effort | Impact |
| --- | ---------------------------------------------- | ------ | ------ |
| 1   | Add skip-to-content link                       | 5 min  | High   |
| 2   | Add global focus indicators                    | 5 min  | High   |
| 3   | Make flip cards keyboard accessible            | 15 min | High   |
| 4   | Add ARIA landmarks                             | 10 min | High   |
| 5   | Implement dark mode toggle                     | 20 min | High   |
| 6   | Create Hero section                            | 30 min | High   |
| 7   | Fix body text color contrast                   | 5 min  | Medium |
| 8   | Add OG/Twitter images + structured data        | 20 min | Medium |
| 9   | Animate mobile menu                            | 15 min | Medium |
| 10  | Animate Tech Stack icons                       | 15 min | Medium |
| 11  | Convert static components to server components | 20 min | Medium |
| 12  | Add lazy loading to images                     | 10 min | Low    |
| 13  | Generate robots.txt + sitemap                  | 10 min | Low    |

---

## 8. Before / After UX Scores (Estimated)

| Metric                   | Before | After (target) |
| ------------------------ | ------ | -------------- |
| Lighthouse Accessibility | ~75    | ≥95            |
| Lighthouse Performance   | ~80    | ≥90            |
| Perfect keyboard nav     | ❌     | ✅             |
| Dark mode support        | ❌     | ✅             |
| Social sharing preview   | ❌     | ✅             |
| Mobile menu animation    | ❌     | ✅             |

---

## 9. Framework Upgrade Consideration

**Not needed.** Next.js 15.3.1 + React 19 is current. The only optional improvement would be upgrading to **Tailwind CSS v4** (the project already uses `@tailwindcss/postcss` v4, which is great).
