# Preview Blog Post

```gherkin
Feature: Preview a blog post
  As the site owner
  I want to see a post's markdown rendered the way the blog shows posts, before I save it
  So that I can catch formatting mistakes without publishing or committing anything

  Scenario: Owner previews a post written in markdown
    Given the owner is signed in and is adding a post in "Blog posts"
    And the owner has typed a body with a heading, a bulleted list, a table, a link and a fenced code block
    When the owner chooses "Preview"
    Then the owner should see the heading, the list, the table, the link and the code block rendered as the blog shows them
    And the code block should be highlighted as the blog highlights it
    And the owner should still be able to return to the form with the typed body unchanged

  Scenario: Owner previews edits to a saved post without saving them
    Given a post "Why I moved to static export" is saved with the body "First draft"
    And the owner has opened it and changed the body to "Second draft" without saving
    When the owner chooses "Preview"
    Then the owner should see "Second draft" rendered
    And after the owner leaves without choosing "Save" and opens the post again, the body should still be "First draft"

  Scenario: Owner previews a post with no body
    Given the owner is adding a post and has left the body empty
    When the owner chooses "Preview"
    Then the owner should see "Nothing to preview yet"
    And the owner should be able to return to the form

  Scenario: Owner previews a long post on a phone
    Given the owner is signed in on a screen 375 pixels wide
    And the post body holds a wide table and a long line of code
    When the owner chooses "Preview"
    Then the page should fit the width with no sideways scrolling
    And the whole table and the whole line of code should be reachable
```

## Assumptions

1. The preview is opened with a control labelled "Preview" on the post form and shows the body as it is typed at that moment, saved or not. [auto]
2. The preview renders the body only. It does not show the title, date, tags or cover image, because the intent asks for the markdown rendered the way the blog shows posts. [auto]
3. The preview uses the same markdown features the blog uses today: tables and strikethrough, heading anchors, code highlighting, and raw HTML shown as real elements. [auto]
4. Raw HTML in a body is rendered as written, as it is on the blog, because only the signed-in owner can write posts and see the preview. [auto]
5. Choosing "Preview" never writes anything to the database; only "Save" does. [auto]
6. The preview matches the blog's content styling, not its page chrome (no site header or footer), and follows the panel's light or dark theme. [auto]
7. A post's body is a field of the post form defined by "Manage blog posts"; this story assumes that form exists and offers the body as typed text. [auto]
8. Opening "Preview" and returning to the form keeps everything typed, so a tab switch or a return never loses input. [auto]
9. Edge-case sweep for the categories the scenarios do not cover. Invalid input: N/A, because any text is a valid body and malformed markdown or HTML simply renders as the blog would render it. Duplicates: N/A, because the preview creates no post. State and lifecycle: N/A, because the preview is a read-only view of the typed text and holds no state of its own beyond what the form already keeps. Offline and time: N/A, because the preview is built from the typed text alone, with no saved data to load and no date shown. Persistence failure: N/A, because Preview never writes (assumption 5), so a failed save cannot arise from it. Multi-actor: N/A, because only the one signed-in owner can open the panel, and a preview is private to that screen. [auto]

## Out of Scope

- Uploading or previewing image files; a cover image path is only text (intent §3)
- Previewing the post inside the blog's real page layout, the listing card or the RSS entry
- Live side-by-side preview while typing
- Sanitising raw HTML in post bodies
- Any change to what visitors see on the public site (phase 2)

## Deferred

- A live split-screen preview — deferred until the owner finds the separate "Preview" step too slow
- Previewing the title, date and cover image beside the body — deferred until the owner asks for a full-page preview
