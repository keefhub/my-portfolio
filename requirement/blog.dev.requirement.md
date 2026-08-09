# Blog Development Feature Requirements

## Document control
- **Feature name:** Blog Development
- **Target website:** `thegoldenpothos.xyz`
- **Primary objective:** Implement a markdown-driven blog section (`/blog`) as part of the existing portfolio, with clear technical behavior and boundaries.

## Scope
- In scope: routing, markdown ingestion, rendering, metadata, RSS, sitemap, validation.
- Out of scope: editorial strategy, content planning, tagging taxonomy decisions, and day-to-day post curation.

## Functional requirements

### Routing
- Provide a blog listing page at `/blog`.
- Provide article detail pages at `/blog/[slug]`.
- Ensure `/blog` is reachable from the global navigation.

### Content source
- Source all blog content from markdown files stored in the repository.
- Each markdown file represents one post.
- No database or external CMS.

### Directory structure (logical)
- Content: `/content/blog/`
- Parsing utilities: `/lib/blog/`
- Blog components: `/components/blog/`

### Frontmatter
- Required fields: `title`, `excerpt`, `date`, `slug`.
- Optional fields: `updated`, `tags`, `draft`, `featured`, `coverImage`, `coverAlt`, `readingTime`.
- Draft posts must be excluded from production listing, RSS, and sitemap.

### Index page behavior
- List published posts in reverse chronological order.
- Display title, date, excerpt, tags, and reading time.
- Show featured posts (if any) with visual priority.

### Article page behavior
- Render markdown content with headings, lists, code blocks, images, and tables.
- Display metadata (title, date, updated date, tags, reading time).
- Provide navigation back to `/blog`.

### Markdown pipeline
- Parse frontmatter from markdown files.
- Transform markdown to HTML/JSX using the chosen framework’s ecosystem.
- Apply syntax highlighting to fenced code blocks.

### Metadata & SEO
- Generate page-specific `<title>` and meta description.
- Add canonical URLs for `/blog` and each article.
- Populate Open Graph and Twitter card metadata.
- Include published posts in the site sitemap.

### RSS
- Generate an RSS feed that lists all published posts.
- Exclude drafts from the feed.

### Validation
- Validate required frontmatter and unique slugs at build time.
- Fail build on invalid or duplicate slugs.

### Non-functional
- Prefer static generation for performance and low hosting cost.
- Reuse existing design system and layout components.
- Maintain accessibility and responsive behavior.

## Deliverables
- Implemented `/blog` and `/blog/[slug]` routes.
- Content utilities for reading and transforming markdown.
- Blog UI components for index and article pages.
- RSS and sitemap integration for posts.
- Minimal code-level documentation for blog utilities.
