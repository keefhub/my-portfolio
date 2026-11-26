# Manage Blog Posts

```gherkin
Feature: Manage blog posts
  As the site owner
  I want to write, edit and delete markdown blog posts in the panel, as drafts or published
  So that I can post and fix articles without opening the code or making a commit

  Scenario Outline: Owner writes a post and sees it listed with its status
    Given the owner is signed in and has opened "Blog posts"
    And the list shows "No posts yet"
    When the owner adds a post with title "Why I moved to static export", excerpt "Notes on the trade-offs", date "2026-05-15", slug "why-static-export", tags "nextjs, firebase", cover image path "/images/blog/static.png", cover alt text "A diagram of the build", a markdown body, and the status "<status>"
    And the owner chooses "Save"
    And the owner reloads the page and opens "Blog posts"
    Then the list should show "Why I moved to static export" with the status "<status>"
    And opening the post should show every value the owner entered

    Examples:
      | status    |
      | Draft     |
      | Published |

  Scenario: Owner saves a post with a slug another post already uses
    Given a post with the slug "why-static-export" exists with the title "Why I moved to static export"
    When the owner adds a different post with the slug "why-static-export" and chooses "Save"
    Then the owner should see "A post with this slug already exists"
    And the post titled "Why I moved to static export" should be unchanged
    And everything the owner typed should still be in the form

  Scenario Outline: Owner saves a post with a missing or malformed required value
    Given the owner is adding a post with every required value filled in correctly
    When the owner changes <field> to <value> and chooses "Save"
    Then the owner should see a message saying <field> needs a valid value
    And the post should not appear in the list
    And everything else the owner typed should still be in the form

    Examples:
      | field   | value             |
      | title   | ""                |
      | excerpt | "   "             |
      | date    | "15 May 2026"     |
      | date    | "2026-02-30"      |
      | slug    | "Why Static Export" |
      | slug    | ""                |

  Scenario: Owner edits an existing post and its slug stays fixed
    Given a published post exists with the slug "why-static-export"
    When the owner opens it, changes the title and the body, turns on "Featured", switches the status to "Draft", and chooses "Save"
    And the owner reloads the page and opens "Blog posts"
    Then the list should show the new title with the status "Draft"
    And "Featured" should still be on when the owner opens the post
    And the slug should still be "why-static-export" and should not be editable

  Scenario: Owner cancels deleting a post
    Given a post "Why I moved to static export" exists
    When the owner chooses "Delete" for it
    And the owner cancels the confirmation
    Then the post should still be in the list
    And after a reload the post should still be in the list

  Scenario: Owner confirms deleting a post
    Given a post "Why I moved to static export" exists
    When the owner chooses "Delete" for it
    And the owner accepts the confirmation
    Then the post should no longer be in the list
    And after a reload the post should still be gone
    And the panel should offer no way to restore it

  Scenario: Owner manages posts on a phone
    Given the owner is signed in on a screen 375 pixels wide
    When the owner opens "Blog posts", the post form, and a post with a long title and a long slug
    Then each screen should fit the width with no sideways scrolling
    And every control should remain reachable
```

## Assumptions

1. A post has a title, excerpt, date, slug, tags, cover image path, cover alt text, markdown body, a "Featured" setting and a status of Draft or Published, the same fields the blog's markdown files carry today. [human: intent §6]
2. Title, excerpt, date, slug and body are required. Tags, cover image path and cover alt text are optional. This matches the blog's own required fields. [auto]
3. The date is typed as `YYYY-MM-DD`, must be a real calendar day, and is shown with the site's UTC date formatting so it never shifts a day (CLAUDE.md invariant 4). [auto]
4. A slug is lowercase letters, digits and hyphens only. Typing capitals or spaces is refused with a message instead of being fixed silently. [auto]
5. The slug is the post's identity. It is fixed after the first save and not editable. To rename a post the owner adds a new one and deletes the old one. [auto]
6. A save that would reuse an existing slug is refused and never overwrites the other post, even if the owner double-clicks "Save" or has the post open in two tabs. [human: intent §6]
7. The list shows each post with its title, date and status, newest date first, with ties broken by title. Posts that share a date keep a stable order. [auto]
8. An empty list reads "No posts yet" with a way to add the first one. [auto]
9. Reading time is not entered. It is worked out from the body when the public site starts reading posts in phase 2. [auto]
10. A failed save (network or refusal by the database) shows an error message, keeps everything typed, and does not claim success. While saving is not yet switched on (the owner's user ID placeholder is still in place), the owner sees the message the owner-only access story defines. [auto]
11. Leaving the form with unsaved changes loses them. The panel does not warn or keep a draft of the form. [auto]
12. Deleting asks for confirmation first. After the owner accepts, the delete is permanent, with no trash or undo. [human: intent §2.4]
13. A draft post is readable only by the owner. This story only sets and shows the status. The database rule that enforces it belongs to the owner-only access story. [human: intent §5]
14. Only the signed-in owner reaches this screen. What a signed-out or non-owner visitor sees is defined by the admin sign-in story. [human: intent §5]
15. The panel styles itself with the site's colour tokens in light and dark themes, and the status is shown as text, not by colour alone. [human: intent §5]
16. The last save wins. There is no conflict detection between two tabs, apart from the slug check on adding a post. [human: intent §8]
17. The cover image is a text path to a file already in the site's repo. The panel does not check that the file exists. [human: intent §2.4]
18. The panel works with the page loaded. Offline, a save fails and is handled as in assumption 10. [auto]

## Out of Scope

- Previewing the markdown as the blog renders it (the preview-blog-post story)
- Uploading or storing images
- Showing these posts on the public blog, RSS feed or sitemap (phase 2)
- Importing the existing markdown posts from the repo
- Changing a post's slug after the first save
- Trash, undo or a version history of a post
- Scheduled publishing
- Other users, invited editors or permission levels

## Deferred

- Search, filter or paging of the post list. Deferred because one owner posting a few times a month will not have a list long enough to need it.
- A warning before leaving a form with unsaved changes. Deferred because the owner is the only author and the cost of retyping is low.
- The "updated" date. Deferred because the panel keeps its own last-saved time and the public site does not read posts from the database yet.
- Conflict detection between two tabs. Deferred because there is one author (intent §8).
