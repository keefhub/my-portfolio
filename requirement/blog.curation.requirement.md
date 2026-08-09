# Blog Curation & Authoring Requirements

## Document control
- **Feature name:** Blog Curation
- **Target website:** `thegoldenpothos.xyz`
- **Primary objective:** Define the content curation, authoring workflow, and governance for a markdown-driven blog attached to the portfolio.

## Scope
- In scope: author workflow, file naming conventions, frontmatter usage rules, tagging conventions, editorial guidelines.
- Out of scope: implementation details of routing, parsing, rendering, RSS, sitemap, or framework-specific code.

## Authoring workflow
1. Copy the post template from `/content/blog/_template.md`.
2. Rename the file using the target slug, e.g. `my-first-post.md`.
3. Fill in required frontmatter fields: `title`, `excerpt`, `date`, `slug`.
4. Add optional fields as needed: `updated`, `tags`, `draft`, `featured`, `coverImage`, `coverAlt`.
5. Write the article body in markdown.
6. Add assets (e.g. cover image) under `/public/blog/<slug>/` if needed.
7. Commit and push the changes to trigger deployment.

## File naming conventions
- Filenames should be lowercase and use hyphens as separators.
- Filenames should normally match the `slug` field.
- Example: `my-first-post.md` with `slug: "my-first-post"`.

## Frontmatter usage
- `title`: Human-readable post title.
- `excerpt`: Short summary for cards and SEO; aim for ~120–180 characters.
- `date`: Original publication date (ISO `YYYY-MM-DD`).
- `updated`: Last updated date (optional, ISO format).
- `slug`: URL-friendly identifier; must be unique.
- `tags`: List of lowercase tags describing the post.
- `draft`: `true` for drafts; `false` or omitted for published content.
- `featured`: `true` to pin the post as featured on the index page.
- `coverImage`: Path to the cover image (optional).
- `coverAlt`: Accessible text description for the cover image.

## Tagging conventions
- Use short, lowercase tags (e.g. `typescript`, `frontend`, `infra`).
- Prefer consistent tags across posts (e.g. `notes` vs `note` → choose one and reuse).
- Limit the number of tags per post to avoid noise (recommended: 1–5).

## Draft and publication rules
- Drafts (`draft: true`) are not considered published content.
- Draft files may remain in the repository indefinitely.
- To publish a post, set `draft: false` (or remove the field) and ensure `date` is populated.

## Editorial guidelines
- Align tone with the portfolio: personal, technical, and reflective.
- Suitable topics include: project retrospectives, implementation notes, learning logs, and personal essays related to engineering.
- Prefer clear, self-contained posts that stand alone without relying heavily on the rest of the site.

## Maintenance guidelines
- Periodically review tags for consistency and merge duplicates.
- Update `updated` field when making substantial content changes.
- Remove or archive posts only when necessary; otherwise prefer adding an update section.

## Reference.md integration
- `Reference.md` should document where blog content lives and how authors interact with it.
- It should link to this curation document and the post template for quick onboarding.
- Any change to the authoring or tagging rules must be reflected here and in `Reference.md`.
