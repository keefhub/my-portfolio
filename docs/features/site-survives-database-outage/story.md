# Site Survives A Database Outage

```gherkin
Feature: Visitors keep seeing the last published content while the database is unreachable
  As a visitor
  I want every public page to keep showing what the owner last published when the database cannot be reached
  So that I never meet an error page or a blank section on the owner's professional site

  Scenario: Visitor reads the landing page while the database is unreachable
    Given the owner has published a profile, experience, tech stack, projects and certifications
    And the database cannot be reached
    When a visitor opens the landing page
    Then the visitor should see every section with the content last published
    And the menu should still link to every section that has content
    And the visitor should not see an error message

  Scenario: Visitor reads the blog while the database is unreachable
    Given the owner has published a post titled "Hello World"
    And the database cannot be reached
    When a visitor opens the blog page and then opens "Hello World"
    Then the blog page should list "Hello World"
    And the post should show its full text as last published

  Scenario: Reader fetches the feed and the sitemap while the database is unreachable
    Given the owner has published a post titled "Hello World"
    And the database cannot be reached
    When a reader opens the RSS feed and the sitemap
    Then both should list "Hello World"
    And neither should show an error

  Scenario: A draft post stays hidden while the database is unreachable
    Given the owner has saved a post titled "Work In Progress" as a draft
    And the database cannot be reached
    When a visitor opens the blog page, the post's own address, the RSS feed and the sitemap
    Then "Work In Progress" should appear in none of them
    And the post's own address should show the page not found message

  Scenario: A saved but unpublished change stays hidden while the database is unreachable
    Given the owner has saved a new project title without pressing Publish
    And the database cannot be reached
    When a visitor opens the landing page
    Then the visitor should see the project title that was last published
    And the visitor should not see the newly saved title

  Scenario: Owner presses Publish while the database is unreachable
    Given the database cannot be reached
    When the owner presses Publish in the panel
    Then the owner should see that the publish failed
    And a visitor opening any public page should still see the content last published

  Scenario: Visitor opens an address that was never a post while the database is unreachable
    Given the database cannot be reached
    When a visitor opens a blog address that has never been a post
    Then the visitor should see the page not found message
    And the visitor should see a way back to the blog page
```

## Assumptions

1. "Unreachable" means the database does not answer, is paused, or refuses the connection; a database that answers with an error is treated the same way. [auto]
2. The kept copy of each public page is the one made at the last Publish or code deploy; an outage never replaces it, and a failed read is never shown as "no content", so a section that had content is never hidden by an outage. [human: intent §5]
3. A post published before the outage is readable at its own address during it, because Publish refreshes every public page, including each published post. [auto]
4. A blog address that has never been a post shows the page not found message during an outage; it is not an error page, and it needs no database answer to be correct. [auto]
5. A publish that fails leaves the kept copies exactly as they were; the failure message itself is the profile publish slice's scenario, and this story asserts only what visitors see. [auto]
6. If the database is unreachable at a code deploy, that deploy may fail and the previous one stays live (the owner accepts this, `docs/requirements/public-site-reads-database.md` Decision 10). [human: intent §4]
7. Visitors are not told that an outage is happening; the pages look as they did before. [auto]
8. Whether Vercel keeps the last good copy on the free plan during a real outage cannot be shown by the test stand-in alone; it is a manual check on SIT, reported as pending, never as passed (decomposition Open findings 2). [auto]
9. Taxonomy sweep, closed without further scenarios: empty state (N/A, the section slices own hidden sections, and assumption 2 stops an outage from looking like empty content); boundaries (N/A, no numbers or limits); invalid input (N/A, visitors enter nothing); duplicates (N/A, repeat presses of Publish belong to the profile publish slice); storage in the browser (N/A, none used); offline (N/A, the visitor's own network is not the subject); presentation (N/A, pages look as before, nothing new to lay out); multi-actor (N/A, the only actor who changes content is the owner, and Publish is owner-only per the profile publish slice); navigation and interruption (N/A, a visitor leaving a page mid-load loses nothing because pages are served as finished copies and visitors enter nothing, and a Publish interrupted by an outage is the failed Publish of scenario 6, which leaves the kept copies as they were per assumption 5). [auto]

## Out of Scope

- A banner or message telling visitors the content may be out of date
- A keep-awake job or scheduled ping for the Supabase project
- Restoring a paused Supabase project (the owner does it in its dashboard)
- A refresh on a timer or when the database comes back; only Publish or a code deploy renews the copies
- A publish history or rollback in the panel
- The wording and states of the Publish failure message (the profile publish slice owns them)

## Deferred

- Showing the age of the kept copy to the owner in the panel, deferred until the owner asks to know how stale the site is
- Sending the owner an alert when the database is unreachable, deferred because it needs a notification service the intent does not approve
