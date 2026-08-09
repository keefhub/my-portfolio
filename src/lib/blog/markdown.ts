import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeHighlight from "rehype-highlight";

/**
 * Convert raw markdown string to HTML.
 * Includes GFM (tables, strikethrough), syntax highlighting,
 * and auto-linked heading anchors.
 *
 * Raw HTML in posts is parsed by rehype-raw rather than passed through as
 * opaque strings, so embedded markup is real elements the later plugins can
 * see. Post content is authored in this repo and trusted; if untrusted
 * markdown is ever rendered here, add rehype-sanitize after rehype-raw.
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      // "append" leaves the heading text as plain text and adds a discreet
      // anchor. "wrap" turned every heading into an unmarked link.
      behavior: "append",
      properties: {
        className: "heading-anchor",
        ariaLabel: "Link to this section",
      },
      content: { type: "text", value: "#" },
    })
    .use(rehypeHighlight, { detect: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown);

  return String(result);
}
