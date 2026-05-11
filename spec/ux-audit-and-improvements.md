# Portfolio Website — UX/UI Audit & Improvement Plan

> **Audited by:** Senior UI/UX Engineer  
> **Date:** May 11, 2026  
> **Scope:** Static portfolio website built with Next.js 15 + React 19 + Tailwind CSS v4 + Framer Motion

---

## 1. Current State Overview

| Aspect     | Status                           |
| ---------- | -------------------------------- |
| Framework  | Next.js 15.3.1 (static export)   |
| Styling    | Tailwind CSS v4                  |
| Animations | Framer Motion v12                |
| Icons      | Lucide React                     |
| Fonts      | Geist (Google Fonts via Next.js) |
| Deployment | Firebase Hosting                 |

---

## 2. Audit Findings

### 2.1 Accessibility (Critical Issues)

| Issue                                      | Severity   | Description                                                        |
| ------------------------------------------ | ---------- | ------------------------------------------------------------------ |
| No skip-to-content link                    | **High**   | Keyboard users must tab through entire nav to reach content        |
| Missing `aria-label` on mobile menu button | **High**   | Screen readers can't identify the toggle action                    |
| Poor color contrast on body text           | **Medium** | `#555` on `#FDF6F0` = 4.2:1 ratio (WCAG AA requires 4.5:1)         |
| No visible focus indicators                | **High**   | Custom styles override browser defaults without replacement        |
| Images lack descriptive `alt` text         | **Medium** | Tech icons alt text is the tool name, which is acceptable          |
| Interactive cards not keyboard-accessible  | **High**   | Flip cards only respond to `onClick`, no `onKeyDown` or `tabIndex` |
| No ARIA landmarks beyond defaults          | **Medium** | Missing `role="navigation"`, `role="main"`, etc.                   |

### 2.2 Performance

| Issue                                         | Severity   | Description                                                         |
| --------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| **All components `"use client"`**             | **High**   | Forces entire page to be client-rendered; no server components used |
| Framer Motion in every component              | **Medium** | Heavy JS bundle; animations could be CSS-based where possible       |
| No lazy-loading for below-fold sections       | **Medium** | All sections load upfront with animations                           |
| Images unoptimized (static export constraint) | **Low**    | Required for static export, but WebP conversion not used            |
| No `next/dynamic` for heavy components        | **Medium** | Framer Motion and flip card logic could be code-split               |

### 2.3 SEO & Metadata

| Issue                      | Severity   | Description                                      |
| -------------------------- | ---------- | ------------------------------------------------ |
| No Open Graph tags         | **High**   | Social sharing previews will be broken           |
| No JSON-LD structured data | **Medium** | Search engines can't parse resume/portfolio info |
| No sitemap                 | **Low**    | Static site, but sitemap helps discoverability   |
| No `robots.txt`            | **Low**    | Not critical for a portfolio                     |
| Title/description minimal  | **Low**    | Could be more descriptive for SEO                |

### 2.4 Visual Design

| Issue                                | Severity   | Description                                                  |
| ------------------------------------ | ---------- | ------------------------------------------------------------ |
| **No hero section**                  | **High**   | Page lacks an immediate value proposition / personality hook |
| No call-to-action (CTA)              | **Medium** | No "Contact me" or "Download CV" button                      |
| Footer is too minimal                | **Low**    | Missing social icons (only text links), no email             |
| No dark mode toggle                  | **Medium** | CSS variables are set up for dark mode but unused            |
| Tech stack section has no animations | **Low**    | Feels static compared to other animated sections             |
| No page transitions                  | **Low**    | Navigation jumps abruptly between sections                   |

### 2.5 Mobile UX

| Issue                                                     | Severity   | Description                                               |
| --------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| Mobile menu has no animation                              | **Medium** | Hamburger content appears/disappears instantly            |
| Timeline staggered animations may cause horizontal scroll | **Low**    | Left/right slide variants could overflow on small screens |
| No touch feedback on interactive elements                 | **Medium** | Buttons/cards lack `active:` state styles                 |
| No bottom navigation/spacer for mobile                    | **Low**    | Could help thumb-reachable navigation                     |

---

## 3. Proposed Improvements (Priority-Ordered)

### P0 — Critical Fixes

| #   | Improvement                            | Effort | Impact |
| --- | -------------------------------------- | ------ | ------ |
| 1   | Add skip-to-content link               | Low    | High   |
| 2   | Fix focus indicators globally          | Low    | High   |
| 3   | Add `aria-label` to mobile menu button | Low    | High   |
| 4   | Make flip cards keyboard-accessible    | Medium | High   |
| 5   | Add Open Graph / meta tags             | Low    | High   |
| 6   | Improve body text contrast             | Low    | Medium |

### P1 — High Impact

| #   | Improvement                                    | Effort | Impact |
| --- | ---------------------------------------------- | ------ | ------ |
| 7   | Add hero section with intro + CTA              | Medium | High   |
| 8   | Animate mobile menu (slide/fade)               | Low    | Medium |
| 9   | Add dark mode toggle with persistence          | Medium | Medium |
| 10  | Add social icons to header/footer              | Low    | Medium |
| 11  | Animate tech stack on scroll                   | Low    | Medium |
| 12  | Convert static components to server components | Medium | Medium |

### P2 — Nice to Have

| #   | Improvement                         | Effort | Impact |
| --- | ----------------------------------- | ------ | ------ |
| 13  | Add JSON-LD structured data         | Medium | Medium |
| 14  | Add page/section transition effects | Medium | Low    |
| 15  | Add loading skeletons               | Medium | Low    |
| 16  | Add "Back to top" button            | Low    | Low    |

---

## 4. Framework Upgrade Assessment

**Current: Next.js 15.3.1 + React 19**

| Consideration                      | Verdict                                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is upgrade needed for features?    | **No.** Next.js 15 is current and fully supports static exports.                                                                                   |
| Is upgrade needed for security?    | **No.** Both are latest stable releases.                                                                                                           |
| Is upgrade needed for performance? | **No.** The bottlenecks are code architecture, not framework version.                                                                              |
| Recommendation                     | **Stay on current versions.** Focus on improving code architecture and following Next.js App Router best practices (server components by default). |

---

## 5. Implementation Plan

### Phase 1 — Accessibility & SEO (P0)

1. Add skip-to-content link in `layout.js`
2. Add focus ring styles in `globals.css`
3. Add `aria-label` and keyboard support to header
4. Update `metadata` export with OG tags in `layout.js`
5. Improve text color contrast

### Phase 2 — Hero Section & Visual Polish (P1)

1. Create a new `hero.jsx` component
2. Add CTA buttons (Contact, Download CV)
3. Animate mobile nav
4. Add dark mode toggle
5. Animate tech stack

### Phase 3 — Component Optimization (P1)

1. Make Footer, Certifications, TechStack server components (remove `"use client"`)
2. Lazy-load sections with `next/dynamic`
3. Convert excessive framer-motion animations to CSS where possible

---

## 6. Success Metrics

| Metric                         | Target            |
| ------------------------------ | ----------------- |
| Lighthouse Accessibility score | ≥ 95              |
| Lighthouse Performance score   | ≥ 80              |
| Lighthouse SEO score           | 100               |
| Mobile usability               | Pass all audits   |
| Color contrast ratio (body)    | ≥ 4.5:1 (WCAG AA) |
