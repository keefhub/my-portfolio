# Owner Publishes Blog Posts

```gherkin
Feature: Owner publishes blog posts
  As the site owner
  I want to save a post in the panel as Published and press Publish
  So that it is listed on the blog page and readable at its own address within a minute, with no code change, and a draft never is

  Scenario: Owner publishes a new post and visitors can list and read it
    Given the owner is signed in and has saved a post with the status "Published", the title "Notes on moving to Vercel", the excerpt "What changed and why", the date "2026-05-15", the slug "moving-to-vercel", the tags "nextjs, vercel", and a body with a heading "Why move", a code block and a line of HTML
    And no code change or deployment has happened since
    When the owner chooses "Publish"
    Then within a minute a visitor who opens the blog page sees "Notes on moving to Vercel" and "What changed and why" in the list
    And the visitor can open the post at "/blog/moving-to-vercel/"
    And the post page shows the title, the tags "nextjs" and "vercel", the date "15 May 2026", the heading "Why move", the code block and the HTML line as formatted content
    And the post page offers a link back to "All posts"

  Scenario: A saved post or a saved edit stays hidden from visitors until the owner publishes
    Given the owner has published a post titled "Notes on moving to Vercel" with the slug "moving-to-vercel"
    And the owner has saved a second Published post titled "Second post" and has saved the new title "Notes on moving to Vercel, revised" for the first, and has not chosen "Publish"
    When a visitor opens the blog page
    Then the visitor sees "Notes on moving to Vercel" and does not see "Second post" or "revised"
    And the visitor who opens "/blog/second-post/" sees the page for a post that was not found
    When the owner chooses "Publish"
    Then within a minute a visitor who opens the blog page sees "Second post" and "Notes on moving to Vercel, revised"

  Scenario: A draft post is not public, even after the owner publishes
    Given the owner has saved a post with the status "Draft", the title "Unfinished thoughts" and the slug "unfinished-thoughts"
    When the owner chooses "Publish"
    Then a visitor who opens the blog page does not see "Unfinished thoughts"
    And a visitor who opens "/blog/unfinished-thoughts/" sees the page for a post that was not found
    And the page for a post that was not found does not show the draft's title, excerpt or body

  Scenario Outline: A post the owner turns into a draft or deletes disappears after the next publish
    Given the owner has published a post titled "Notes on moving to Vercel" with the slug "moving-to-vercel"
    And the owner <change> that post and has not yet chosen "Publish"
    And a visitor still sees the post in the blog list
    When the owner chooses "Publish"
    Then within a minute a visitor who opens the blog page no longer sees "Notes on moving to Vercel"
    And a visitor who opens "/blog/moving-to-vercel/" sees the page for a post that was not found

    Examples:
      | change                                   |
      | switched the status to "Draft" and saved |
      | deleted                                  |

  Scenario: A visitor opens a post address that does not exist
    Given the owner has published a post with the slug "moving-to-vercel"
    When a visitor opens "/blog/moving-to-vercle/"
    Then the visitor sees the page for a post that was not found
    And the page has a link back to the site

  Scenario: A featured post is shown under "Featured" and not repeated under "All Posts"
    Given the owner has published a post titled "Notes on moving to Vercel" with "Featured" on, and a post titled "Second post" with "Featured" off
    When a visitor opens the blog page
    Then the visitor sees "Notes on moving to Vercel" under "Featured"
    And the visitor sees "Second post" under "All Posts"
    And "Notes on moving to Vercel" is not listed under "All Posts"

  Scenario: The blog page with no published posts says so and shows no error
    Given the owner has no post with the status "Published"
    When a visitor opens the blog page
    Then the visitor sees "No posts yet — check back soon!"
    And the visitor sees no error message
    And the "Blog" link in the menu still shows
```

## Assumptions

1. This feature builds on the built panel: the "Blog posts" screen with its "Save", the status "Draft" or "Published", "Featured", the cover, and the "Publish" button with its owner-only check from the profile slice. It adds the public reading of published posts. The owner-only checks, the failure message and the disabled button while publishing are those of the profile slice and are not repeated here. [auto]
2. The blog page and each post page read the saved posts from the database on the server, and only posts with the status "Published". Vercel keeps the last good copy of each page. A copy is renewed only by "Publish" or a code deploy, never on a timer and never when a visitor opens a page. [human: intent §4]
3. Saving a post, an edit, a switch to "Draft" or a delete does not change what visitors see until the owner chooses "Publish". A code deploy also shows everything saved so far, which the owner accepts. [human: intent §2.4, §5]
4. A draft post never appears in the blog list or at its own address, whether or not "Publish" was pressed. The server returns only posts with the status "Published" to a public page, so a draft is never put on a page. The same rule for RSS and the sitemap is the next slice's. [human: intent §5]
5. A post saved with a new slug is readable at "/blog/<slug>/" after "Publish" with no build, no code change and no deployment. An address with no published post (unknown, mistyped, deleted or draft) gives the same not-found page as any other missing page, which has a link back to the site. [human: intent §4, §5; auto]
6. The post page and the list show what the panel stores: title, excerpt, date, tags, cover image with its alt text, "Featured" and the body. The posts have no "Updated" date in the database, so neither page shows one and the "x min read" figure is computed from the body. [auto; intent §8]
7. The body is markdown rendered the way the preview already renders it, and raw HTML in it is trusted and shown as real elements, because only the owner can write a post. No sanitiser is added. [human: intent §2.4, §3]
8. Dates are shown in the same form as today, such as "15 May 2026", and are read as UTC, so a visitor in any time zone sees the day the owner entered. [human: intent §5]
9. Posts in the list are ordered newest date first, and two posts with the same date keep a fixed order by title, so a refresh never reorders them. [auto]
10. A very long title, excerpt, tag or unbroken word wraps inside its card or page, with nothing past a 375-pixel-wide phone screen, and the list has no paging because the owner writes a few posts a month. [auto]
11. The blog list, the post page and the not-found page use the site's colour tokens, work in the light and dark themes and by keyboard, and keep today's headings and link names. [auto; intent §5]
12. Empty and zero state: no published posts shows "No posts yet — check back soon!" under "All Posts" and no "Featured" block. The "Blog" menu link is not a section of the landing page and always shows. [auto; intent §2.4]
13. The database being unreachable when a public page is opened is the outage slice's. Here it is only covered that a publish that fails leaves the blog pages unchanged, which is the profile slice's failure message and applies to every section. [human: intent §5; auto]
14. A visitor's browser loads no database code, address or key, and the page source holds no secret value or owner email. The public read does not look at who is visiting or at their cookies. [human: intent §5]
15. This feature removes the posts written into the repo (the two markdown files under the blog content folder and the code that reads them from the repo) in its own commit, so the pull request names that commit and the owner can re-enter them in the panel. Until the owner re-enters and publishes them, the blog page shows "No posts yet — check back soon!". [human: intent §2.4, §5; auto]
16. This feature amends the standing rules it makes false: the rule that the blog's barrel is never imported from a client component and the "Blog authoring" section of the project rules, which describe posts as files in the repo. The overview already carries the new rule. [auto; intent §4]
17. Not applicable: invalid and malformed input, because the visitor types nothing, and the panel's own validation of a post is already covered by the "Owner manages blog posts" story. Duplicate slugs are refused there too. Also not applicable: navigation and interruption, because a visitor who leaves a blog page mid-load or presses back simply gets the last published copy of the page they open next, and there is no form or multi-step flow on the public pages to interrupt. [auto]
18. Not applicable: offline and time beyond UTC dates, because a scheduled post is a non-goal and there is no clock-based rule. [human: intent §3]
19. Two browser tabs: the owner who publishes in one tab and has an older copy of the post open in another saves the older text over the newer, as the panel already does. The visitor-facing pages are not affected and no new conflict handling is added. [auto; intent §8]
20. Automated tests use a stand-in for the database and for sign-in, with a made-up owner email set only in the test run's environment. The owner checks one real publish of a post on the SIT site (intent §7). [auto]
21. No secret value and not the owner's email appears in the repo, in a page's source, in a test file or in a log, and this feature adds no dependency, setting or service. [human: intent §4, §5]

## Out of Scope

- RSS and the sitemap listing a post and omitting a draft. The next slice, "Owner publishes posts to RSS and the sitemap", does that.
- Keeping the last published pages when the database is down. The outage slice proves that across every public page.
- A one-time import of today's posts. The owner re-enters them by hand.
- Scheduled posts that go live at a future time.
- A full-site preview of a draft, beyond the existing preview in the panel.
- A publish history or rollback, search, tag pages, comments and paging of the list.
- Sanitising the post's HTML.

## Deferred

- An "Updated" date on posts. The panel stores none and the owner has not asked for one.
- Tag pages and filtering the blog list by tag. No stated need.
- A "Last published" time beside the button. The intent lists no history.
