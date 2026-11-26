interface PostBodyProps {
  html: string;
}

export default function PostBody({ html }: PostBodyProps) {
  return (
    // Colours, code tokens and element tweaks live in globals.css under
    // "Blog — Prose Theming", driven by the site design tokens.
    // The HTML is repo-authored or the signed-in owner's own text, so it is
    // trusted; this use is moved from BlogArticle, not added.
    <div
      className="prose prose-lg max-w-none prose-a:no-underline hover:prose-a:underline"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
