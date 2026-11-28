# Owner Publishes Posts To RSS And The Sitemap

```gherkin
Feature: Owner publishes posts to RSS and the sitemap
  As the owner
  I want the RSS feed and the sitemap to list the posts I publish and leave out my drafts
  So that readers and search engines find new posts without a code change

  Scenario: Owner publishes a post and it appears in RSS and the sitemap
    Given the owner has saved a post "Growing Pothos" that is not a draft
    When the owner presses Publish in the panel
    Then the RSS feed should list "Growing Pothos" with its address and excerpt
    And the sitemap should list the address of "Growing Pothos"
    And the sitemap should show the post's own date as its last-modified date

  Scenario: A draft post is in neither RSS nor the sitemap
    Given the owner has saved a post "Half Written" marked as a draft
    When the owner presses Publish in the panel
    Then the RSS feed should not list "Half Written"
    And the sitemap should not list the address of "Half Written"

  Scenario: A saved post stays out of RSS and the sitemap until Publish is pressed
    Given the owner has pressed Publish with one post "Growing Pothos" saved
    And the owner then saves a second post "Repotting Guide" that is not a draft
    When a visitor opens the RSS feed and the sitemap
    Then the RSS feed should list "Growing Pothos" but not "Repotting Guide"
    And the sitemap should list the address of "Growing Pothos" but not that of "Repotting Guide"

  Scenario: Owner turns a published post back into a draft and both feeds drop it
    Given the RSS feed and the sitemap list the post "Growing Pothos"
    And the owner has saved "Growing Pothos" again as a draft
    When the owner presses Publish in the panel
    Then the RSS feed should not list "Growing Pothos"
    And the sitemap should not list the address of "Growing Pothos"

  Scenario: Owner deletes a published post and both feeds drop it
    Given the RSS feed and the sitemap list the post "Growing Pothos"
    And the owner has deleted "Growing Pothos" in the panel
    When the owner presses Publish in the panel
    Then the RSS feed should not list "Growing Pothos"
    And the sitemap should not list the address of "Growing Pothos"

  Scenario: Feeds list several published posts with the newest first
    Given the owner has saved published posts dated "2026-03-01" and "2026-05-15"
    When the owner presses Publish in the panel
    Then the RSS feed should list the "2026-05-15" post before the "2026-03-01" post
    And both posts should show their date as the same calendar day in every time zone

  Scenario: No published posts leaves valid feeds with no post entries
    Given the owner has no saved posts that are not drafts
    When the owner presses Publish in the panel
    Then the RSS feed should open as a feed with no items
    And the sitemap should list only the home page and the blog page
```

## Assumptions

1. The feeds are refreshed by the same Publish press and the same owner check that the other published content uses; this story adds no button, address or owner-facing screen of its own. [human: intent §4]
2. The posts listed are exactly the posts the blog page lists, in the same newest-first order, so the feeds and the blog page never disagree after a Publish. [auto]
3. Posts have no "updated" date in the database, so the sitemap's last-modified date for a post is the post's own date. [auto]
4. The RSS feed keeps its current content type, item fields (title, excerpt, date, address) and channel details; only where the posts come from changes. [auto]
5. A saved post that is not a draft stays out of both feeds until Publish is pressed, and a draft stays out of both feeds whether or not Publish is pressed. [human: intent §2.4, §5]
6. With no published posts, the feed is still a valid feed with no items and the sitemap still lists the home page and the blog page; neither is an error or an empty file. [auto]
7. A change that fails to publish leaves both feeds as they were, because the failed Publish changes no public page. [human: intent §5]
8. Both feeds read the database on the server and hold the last good result, so they keep working while the database cannot be reached; proving that belongs to the outage story, not this one. [human: intent §4]
9. Dates are formatted in UTC, so a post shows the same calendar day wherever it is read. [human: intent §5]
10. Post addresses in both feeds are built from the one site address constant with the trailing slash the site uses. [human: intent §5]
11. Any visitor may read both feeds; they need no sign-in and carry no owner email or secret. [human: intent §5]
12. Two tabs or two quick presses of Publish end with the same feeds, because Publish refreshes everything from what is saved at that moment. [auto]
13. The listed posts come from the same database the site is deployed against: Publish on SIT changes the SIT feeds only. [human: intent §5]
14. Nothing in this story takes owner input, so invalid input has no case here, and no screen is added, so keyboard use, phone width and reduced motion do not apply. The panel's own screens are covered by their stories. [auto]
    - Boundaries & precision: one published post gives a feed with one item and a sitemap with one post address (scenario 1 covers a single post and scenario 6 several); a very large number of posts is N/A — the owner writes posts by hand, so the count stays small, and no limit is added; two posts with the same date are listed in the same order the blog page lists them (Assumption 2), so the feeds never disagree with it. [auto]
    - Navigation & interruption: N/A — this story adds no screen, form or step for the owner to leave; a visitor who leaves a feed mid-load simply gets the whole file on the next request, and the owner closing the panel while "Publishing…" is covered by `owner-publishes-profile`. [auto]
15. A mistyped or old feed address returns the site's not-found page as every other unknown address does; no redirect is added. [auto]

## Out of Scope

- The blog list page, post addresses, draft handling on those pages and the featured post (`owner-publishes-blog-posts`)
- The Publish button, its owner check and its failure message (`owner-publishes-profile`)
- Keeping the feeds up while the database is unreachable (`site-survives-database-outage`)
- Deleting the old repo posts and the old reading code (`retire-repo-content`)
- Full post text inside the RSS feed, category tags per item, and an author field
- A feed per tag, and a robots file that changes
- Scheduled posts that appear in the feeds at a future time

## Deferred

- An "updated" date on posts in the sitemap. The panel stores none and the owner has not asked for one.
- Full post content in RSS items. Readers get the excerpt and a link today, and nobody has asked for more.
- Pinging search engines when a post is published. No stated need, and it would add an outside service.
