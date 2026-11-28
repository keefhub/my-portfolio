# Retire Repo Content And Amend The Standing Docs

```gherkin
Feature: Retire the repo's copy of the content and amend the standing docs
  As the owner
  I want the project to hold no copy of my site content and its documents to describe the new rules
  So that the panel is the only place content lives and nobody is misled by rules that are no longer true

  Scenario: The site shows the saved content with no copy left in the project
    Given the owner has saved and published a profile, an experience entry, a tech category, a project, a certification and a post "Growing Pothos" in the panel
    And the project holds no copy of any of that content
    When a visitor opens the home page and the blog page
    Then the visitor should see the published profile, experience entry, tech category, project and certification
    And the visitor should see "Growing Pothos" listed on the blog page

  Scenario: The project holds no hard-coded section content
    Given every section slice of this goal has been delivered
    When the project is searched for the profile, experience, tech stack, projects and certifications text that the site showed before this goal
    Then none of that text should be found in the project
    And the project should hold no list of social links, jobs, tech items, projects or certifications written into the pages

  Scenario: The project holds no blog posts
    Given every post that was written into the project has been removed
    When the project is searched for blog post files
    Then no post should be found
    And a post the owner saved as a draft should still be absent from the blog page, its own address, RSS and the sitemap

  Scenario: The standing documents describe the new rules
    Given the owner's ruling is that public pages read the database and keep the last good copy
    When the project documents are read
    Then none should say that public pages are prerendered at build time or that blog content lives in files in the project
    And the documents should say that content lives only in the database and is refreshed when the owner presses Publish
    And the pull request should flag that these rules were rewritten

  Scenario: Nothing new was added to run the site
    Given the site ran on seven named settings and its existing dependencies before this goal
    When the project's dependencies and settings are compared with their state before this goal
    Then no dependency, setting, external service or paid service should have been added
    And no setting or address in the project should name the other environment's database

  Scenario: No secret, database address or owner email is exposed
    Given the project has been fully changed by this goal
    When the project's files, the pages sent to visitors and the logs of the build are read
    Then no secret value, database address or owner email should appear in any of them
    And no database code should be sent to a visitor's browser

  Scenario: The standing rules that were not replaced still hold
    Given the project has been fully changed by this goal
    When the site is built and the public addresses are opened
    Then every public address should resolve in its form with a trailing slash
    And dates should show the same calendar day in every time zone
    And images should be served as uploaded, with no converted copies
    And the panel should still refuse anyone but the signed-in owner
```

## Assumptions

1. This story removes nothing that an earlier slice of this goal already removed; it checks that nothing is left and fixes the documents the earlier slices did not touch. [auto]
2. "Hard-coded content" means the visible text, links and image references of the profile, experience, tech stack, projects, certifications and posts. Labels of the site's own interface (menu words, button text, section headings) stay in the project. [auto]
3. The documents swept are `CLAUDE.md`, `Reference.md`, `README.md` and `docs/features/OVERVIEW.md`. Stories and specs of finished features are history and are not rewritten. [auto]
4. The check for leftover content is done once, against the final state of the project, and is repeatable from the pull request. It runs as a check on the project's files and a build, not as a visitor action. [auto]
5. The owner re-enters today's content by hand and this story gives no import or recovery tool. The pull request names the commits that removed each piece so the old text can be read from history. [human: intent §3, §8]
6. No new dependency, setting or service is added, and nothing in this story depends on one. [human: intent §4, §5]
7. The "different databases" half of the separation between SIT and live cannot be shown with one test database. This story checks only that nothing in the project names the other environment; the rest is a manual check on SIT and live. [auto]
8. Edge-case sweep, empty and zero state: a database with nothing saved is covered by the section slices (hidden sections) and the outage story; here the home page is asserted only with content present. [auto]
9. Boundaries, invalid input and duplicates: N/A, this story has no input, quantity or identity. [auto]
10. State and lifecycle: the removal order across slices is fixed by the run order, and the first scenario is the check that the end state works. A page reached through an old address is unchanged by this story. [auto]
11. Persistence failure: N/A for this story. A database that is unreachable is covered by the outage story, which this story depends on. [auto]
12. Navigation and interruption, and offline and time: N/A beyond the UTC date rule restated in the last scenario. [auto]
13. Presentation and scale: N/A, no screen changes. [auto]
14. Multi-actor and permissions: the owner-only panel rule is restated in the last scenario; there is no other actor. [auto]

## Out of Scope

- A one-time import or export tool for today's content
- Keeping the repo copy as a fallback while the database is empty or down
- Rewriting finished stories, specs or the decomposition documents
- Sanitising blog post HTML
- Scheduled posts, a keep-awake job, a publish history or a rollback
- Any new dependency, setting, external service or paid service

## Deferred

None.
