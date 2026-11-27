# Owner Previews Blog Post

```gherkin
Feature: Owner previews a blog post
  As the site owner
  I want to see a post's markdown body rendered the way the blog shows it, before I save
  So that I can catch formatting mistakes without publishing or saving anything

  Scenario: Owner previews a body with a heading, a list, a table, a link and a code block
    Given the owner is signed in and is adding a post on the "Blog posts" screen
    And the body holds a heading, a bulleted list of two items, a table, a link and a code block
    When the owner chooses "Preview"
    Then the owner sees the heading, the list, the table, the link and the code block as the blog shows them
    And the code block is coloured with the blog's highlighting
    And only the body is shown, not the title, the excerpt or the date
    And no post is saved and "Entry saved" is not shown

  Scenario: Owner returns from the preview to the form with everything as typed
    Given the owner has filled every field of the Add post form and chosen "Preview"
    Then "Save" and "Cancel" are not offered
    When the owner chooses "Back to form"
    Then every field holds what was typed, and the body is exactly as typed
    And "Save" and "Cancel" are offered again
    And choosing "Preview" again after changing the body shows the changed body

  Scenario: Owner previews unsaved edits to a saved post without saving them
    Given a saved post "Why I moved to static export" has the body "First draft"
    And the owner has opened it with "Edit" and changed the body to "Second draft"
    When the owner chooses "Preview"
    Then the owner sees "Second draft" and not "First draft"
    And after the owner chooses "Back to form" and "Cancel" and reloads the page, the saved post still has the body "First draft"

  Scenario Outline: Owner previews a body with no content
    Given the owner is adding a post whose body is <body> and whose other fields are empty
    When the owner chooses "Preview"
    Then the owner sees "Nothing to preview yet"
    And no refusal message about the other fields is shown
    And "Back to form" returns to the form with the body still <body>

    Examples:
      | body                                       |
      | empty                                      |
      | only spaces, tabs and line breaks          |

  Scenario: Owner previews a wide table and a long line of code on a phone
    Given the owner is on a screen 375 pixels wide
    And the body holds a table with three 40-character cells and a code line of 200 characters
    When the owner chooses "Preview"
    Then the page does not scroll sideways
    And the whole table and the whole code line can be reached by scrolling inside the preview
    And "Preview" and "Back to form" fit the screen width and are at least 44 pixels tall

  Scenario: Preview follows the panel's light and dark theme
    Given the owner has chosen "Preview" for the body "A plain paragraph"
    When the owner switches the theme from light to dark
    Then the paragraph takes the dark theme's text colour from the site's colour tokens

  Scenario Outline: Anyone other than the owner never reaches the preview
    Given a visitor is <visitor>
    When the visitor opens the panel at its usual address
    Then the panel shows no post form and no "Preview" button

    Examples:
      | visitor                                                |
      | signed out                                             |
      | signed in with a Google account that is not the owner's |
```

## Assumptions

1. The "Blog posts" screen (`owner-manages-blog-posts`) provides the Add post and Edit forms with a Body field, "Save" and "Cancel". It has no spec yet, so this story assumes those names and puts "Preview" in both forms, not in the post list. [auto]
2. The preview shows the body exactly as typed at that moment, saved or not. The preview shows only the body: no title, excerpt, date, tags, cover, site header or footer. [auto]
3. The preview uses the blog's own markdown rendering and its article styling, so it matches a published post. This includes heading anchors labelled "Link to this section", strikethrough, tables and code highlighting. [auto]
4. Raw HTML in the body renders as real elements, as it does on the blog. Only the owner can type a body, so it is trusted. [auto]
5. "Preview" and "Back to form" are the only controls in the preview. "Save" and "Cancel" are hidden meanwhile, because a save from the preview would show refusals about fields the owner cannot see. [auto]
6. Preview checks nothing and stores nothing. A form with a blank title, excerpt, date or slug previews without any refusal message. A taken slug is not reported until "Save". [auto]
7. A body counts as blank when it holds only spaces, tabs and line breaks. A body of one character such as "x" is not blank and previews as "x". [auto]
8. The preview needs no server request once the form is open. It works if the connection drops after the form loads, and a signed-in session that ends while previewing does not close the preview. A later "Save" is refused by the rules of `owner-manages-blog-posts`. [auto]
9. Preview has no web address of its own. Reloading while previewing returns the owner to the post list and loses unsaved typing, as it does from the form. [auto]
10. Choosing "Preview" twice in a row shows one preview, not two. [auto]
11. The preview has no length limit. A long body is shown whole, and the preview scrolls inside its own box. [auto]
12. "Preview" and "Back to form" are native buttons, so keyboard and screen reader use works as for the rest of the panel. The preview adds no animation. [auto]
13. The preview and its styling use the site's colour tokens only, in light and dark themes. [human: intent §5]
14. Only the owner reaches the panel and so the preview. The preview adds no request to the server, so no new refusal rule is needed. [human: intent §2.4, §5]
15. Public pages are untouched. They show the same posts as before, and the preview code ships in the panel only. Public addresses are checked by `owner-google-sign-in` and `retire-firebase`. [human: intent §5]

## Out of Scope

- Showing the title, date, tags or cover in the preview, or previewing inside the blog's page layout, listing card or feed entry
- A live side-by-side preview that updates as the owner types
- Uploading or previewing image files
- A warning about unsaved changes when leaving the form
- Reading time, word count or any other measure of the body
- A shareable preview link, or a way for anyone but the owner to read a draft
- Cleaning raw HTML in the body

## Deferred

- Cleaning raw HTML in the body, deferred until untrusted markdown can be rendered anywhere
- Showing the post header and cover in the preview, deferred until the owner asks for a full-page preview
