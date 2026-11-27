# Owner Manages Blog Posts

```gherkin
Feature: Owner manages blog posts
  As the site owner
  I want to write, edit and delete markdown blog posts in the panel, as drafts or published
  So that I can post and fix articles without opening the code or making a commit, and no one else can read my drafts or change a post

  Scenario Outline: Owner writes a post and sees it listed with its status
    Given the owner is signed in with their Google account and has opened "Blog posts"
    And the list shows "No posts yet"
    And an image "diagram.png" has been uploaded to the image library
    When the owner adds a post with title "Notes on moving to Vercel", excerpt "What changed and why", date "2026-05-15", slug "moving-to-vercel", tags "nextjs, vercel", cover alt text "A diagram of the hosting move", a markdown body, and the status "<status>"
    And the owner gives the cover image by <cover choice>
    And the owner chooses "Save"
    And the owner reloads the page and opens "Blog posts"
    Then the list should show "Notes on moving to Vercel" with the status "<status>"
    And opening the post should show every value the owner entered
    And the cover image should still be the one the owner gave

    Examples:
      | status    | cover choice                                    |
      | Draft     | typing the repo path "/images/blog/vercel.png"  |
      | Published | choosing "diagram.png" from the uploaded images |

  Scenario: Owner saves a post with a slug another post already uses
    Given a post with the slug "moving-to-vercel" exists with the title "Notes on moving to Vercel"
    When the owner adds a different post with the slug "moving-to-vercel" and chooses "Save"
    Then the owner should see "A post with this slug already exists"
    And the post titled "Notes on moving to Vercel" should be unchanged
    And everything the owner typed should still be in the form

  Scenario Outline: Owner saves a post with a missing or malformed required value
    Given the owner is adding a post with every required value filled in correctly
    When the owner changes <field> to <value> and chooses "Save"
    Then the owner should see a message saying <field> needs a valid value
    And the post should not appear in the list
    And everything else the owner typed should still be in the form

    Examples:
      | field   | value               |
      | title   | ""                  |
      | excerpt | "   "               |
      | date    | "15 May 2026"       |
      | date    | "2026-02-30"        |
      | slug    | "Moving To Vercel"  |
      | slug    | ""                  |
      | body    | "   "               |

  Scenario: Owner edits a published post, switches it to draft, and its slug stays fixed
    Given a published post exists with the slug "moving-to-vercel"
    When the owner opens it, changes the title and the body, turns on "Featured", switches the status to "Draft", and chooses "Save"
    And the owner reloads the page and opens "Blog posts"
    Then the list should show the new title with the status "Draft"
    And "Featured" should still be on when the owner opens the post
    And the slug should still be "moving-to-vercel" and should not be editable
    And a signed-out request for the published posts should no longer return it

  Scenario: Owner cancels deleting a post
    Given a post "Notes on moving to Vercel" exists
    When the owner chooses "Delete" for it
    And the owner cancels the confirmation
    Then the post should still be in the list
    And after a reload the post should still be in the list

  Scenario: Owner confirms deleting a post
    Given a post "Notes on moving to Vercel" exists
    When the owner chooses "Delete" for it
    And the owner accepts the confirmation
    Then the post should no longer be in the list
    And after a reload the post should still be gone
    And the panel should offer no way to restore it

  Scenario Outline: A draft post is readable only by the owner
    Given the owner has saved the draft "Unfinished thoughts" and the published post "Notes on moving to Vercel"
    When <requester> asks for <what>
    Then <result>

    Examples:
      | requester                                                         | what                           | result                                                                          |
      | a signed-out visitor                                              | the published posts            | only "Notes on moving to Vercel" should be returned                             |
      | a signed-out visitor                                              | the post "Unfinished thoughts" | the request should be refused and no text of the draft should be returned       |
      | someone signed in with a Google account that is not the owner's   | the post "Unfinished thoughts" | the request should be refused and no text of the draft should be returned       |
      | the owner                                                         | all posts                      | both posts should be returned, each with its status                             |

  Scenario Outline: A request to change a post is refused when it does not come from the owner
    Given the post "Notes on moving to Vercel" exists
    When <requester>, without using the panel, asks to <action>
    Then the request should be refused
    And the stored posts should be exactly as they were

    Examples:
      | requester                                                         | action          |
      | a signed-out visitor                                              | add a post      |
      | a signed-out visitor                                              | change the post |
      | a signed-out visitor                                              | delete the post |
      | someone signed in with a Google account that is not the owner's   | add a post      |
      | someone signed in with a Google account that is not the owner's   | change the post |
      | someone signed in with a Google account that is not the owner's   | delete the post |

  Scenario Outline: Owner meets a database that cannot be reached
    Given the owner is signed in with their Google account
    And the database cannot be reached
    When the owner <action>
    Then the owner should see a message saying the database is unavailable
    And <kept>
    And the public site should still load

    Examples:
      | action                                                                 | kept                                                          |
      | opens "Blog posts"                                                     | the list should not say "No posts yet"                        |
      | fills in a new post and chooses "Save"                                 | everything the owner typed should still be in the form        |
```

## Assumptions

1. A post has a title, excerpt, date, slug, tags, cover image, cover alt text, markdown body, a "Featured" setting and a status of Draft or Published, the same fields the earlier panel and the blog's markdown files carry. [human: intent §8]
2. Title, excerpt, date, slug and body are required. Tags, cover image and cover alt text are optional. This matches the blog's own required fields. [auto]
3. The date is typed as `YYYY-MM-DD`, must be a real calendar day, and is shown with the site's UTC date formatting so it never shifts a day (CLAUDE.md Invariant 4). [auto]
4. A slug is lowercase letters, digits and hyphens only. Capitals or spaces are refused with a message and never fixed silently. [auto]
5. The slug is the post's identity. It is fixed after the first save. To rename a post, the owner adds a new one and deletes the old one. [auto]
6. A save that would reuse an existing slug is refused and never overwrites the other post, also when the owner chooses "Save" twice quickly or has the form open in two tabs. [auto]
7. The list shows each post's title, date and status, newest date first, with ties broken by title. An empty list reads "No posts yet" with a way to add the first post. The list is not reorderable. [auto]
8. Reading time is not entered. It is worked out from the body when the public site starts reading posts from the database. [auto]
9. A draft post can be read only by the owner. The server decides this on every request, so a request sent without the panel gets the same answer. [human: intent §5]
10. A signed-out request for published posts returns the published posts only, with their title, excerpt, date, slug, tags, cover, body and "Featured" setting, and never a draft. The server answers it, so no database key reaches the browser. [auto]
11. Every request that adds, changes or deletes a post is refused for a signed-out visitor and for any Google account other than the owner's, whether or not it comes from the panel. The refused request changes nothing. [human: intent §5]
12. Saving a post as Published does not put it on the public blog, the feed or the sitemap. Public pages keep showing the posts in the repo until a later goal moves them. [human: intent §3]
13. Deleting asks for confirmation first. After the owner accepts, the delete is permanent, with no trash or undo. [human: intent §2.4]
14. The last save wins. There is no conflict detection between two tabs, apart from the slug check when adding a post. [human: intent §8]
15. If a post was deleted in another tab, saving an edit to it is refused with a message that the post no longer exists. The form keeps what the owner typed and the post is not recreated. [auto]
16. A database that cannot be reached (including a free project that has paused, which the owner accepts) shows a message saying the database is unavailable. The wording is the one the profile screen uses. A failed read never shows as "No posts yet". A failed save keeps what the owner typed and does not claim success. [human: intent §4]
17. A save refused because the owner's sign-in has ended shows a message and keeps what the owner typed. The owner signs in again and saves. [auto]
18. The cover image is either an image chosen from the uploaded images or a text path to a file already in the repo. The post keeps whichever the owner gave and shows it again after a reload. The panel does not check that a typed repo path exists. Choosing an uploaded image fills the cover with its address. Deleting an uploaded image that a post still uses leaves the post unchanged, and its cover then fails to load as a wrong repo path would. [human: intent §2.4]
19. Leaving the form with unsaved changes, including by a reload, loses them. The panel does not warn and keeps no draft of the form. [auto]
20. The panel works with the page loaded. Offline, a save fails and is handled as in assumption 16. [auto]
21. The database starts empty. The posts in the repo are not imported. [human: intent §8]
22. The screen styles itself with the site's colour tokens in light and dark themes, and shows status as text, not by colour alone. [human: intent §5]
23. Phone width and long values: the screen reuses the list and form layout that `owner-manages-experience` fixes, so long titles and slugs wrap, nothing scrolls sideways, and every control stays reachable. No scenario here repeats that check. [auto]
24. Posts have no length limit and no cap on their number beyond what the database accepts. One owner posting a few times a month will not reach either. [auto]
25. This story adds no new setting names. It uses the database and storage settings the profile and image stories introduce, and no secret value appears in the repo, a page or a log. [human: intent §5]
26. The list pattern (add, edit, confirm-delete) comes from `owner-manages-experience`, and the image picker from `owner-uploads-images`. Neither has a spec yet, so this story assumes both exist as their stories describe. [auto]

## Out of Scope

- Previewing the markdown as the blog renders it (the `owner-previews-blog-post` story)
- Uploading or deleting images (the `owner-uploads-images` story; this story only chooses from what it holds)
- Showing these posts on the public blog, the feed or the sitemap
- Importing the existing markdown posts from the repo
- Changing a post's slug after the first save
- Reordering posts by hand
- Trash, undo or a version history of a post
- Scheduled publishing
- Other users, invited editors or permission levels
- Visitor comments, likes or any other data a visitor can store

## Deferred

- Search, filter or paging of the post list. One owner posting a few times a month will not have a list long enough to need it.
- A warning before leaving a form with unsaved changes. The owner is the only author and retyping costs little.
- An "updated" date. The public site does not read posts from the database yet.
- Conflict detection between two tabs. There is one author (intent §8).
