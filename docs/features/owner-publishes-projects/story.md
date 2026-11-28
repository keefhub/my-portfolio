# Owner Publishes Projects

```gherkin
Feature: Owner publishes projects
  As the site owner
  I want to press Publish after changing my projects in the panel
  So that the Projects section shows my current projects within a minute, with no code change

  Scenario: Owner publishes a changed project and visitors see it within a minute
    Given the Projects section shows the project "Quantum Notes" with a "Live Demo" link
    And the owner is signed in and opens the "Projects" screen in the panel
    When the owner changes the title to "Quantum Notes 2" and removes the demo link
    And the owner chooses "Save"
    And the owner chooses "Publish"
    Then the owner should see that the publish succeeded
    And within one minute a visitor reloading the home page should see "Quantum Notes 2" in the Projects section
    And the visitor should see no project called "Quantum Notes" and no "Live Demo" link on it

  Scenario: A saved project change stays hidden from visitors until Publish
    Given the Projects section shows the project "Quantum Notes"
    And the owner is signed in and has saved the new title "Quantum Notes 2" without publishing
    When a visitor reloads the home page
    Then the visitor should still see "Quantum Notes" in the Projects section
    And the visitor should not see "Quantum Notes 2"

  Scenario: Published projects appear in the order the owner set
    Given the owner has saved projects "Alpha", "Beta" and "Gamma", in that order
    And the owner has moved "Gamma" up so the order is "Alpha", "Gamma", "Beta"
    When the owner chooses "Publish"
    Then a visitor should see the projects in the order "Alpha", "Gamma", "Beta"
    And each project should show its short description and its tech names

  Scenario: Projects section and its menu link disappear when the owner deletes every project
    Given the Projects section is visible and its "Projects" menu link is shown
    And the owner is signed in and has deleted every project in the panel
    When the owner chooses "Publish"
    Then a visitor should see no Projects section and no "Projects" menu link
    And the rest of the home page should render as before

  Scenario: A site with no saved projects shows no Projects section
    Given no project has ever been saved in the panel for this site
    When a visitor opens the home page
    Then the visitor should see no Projects section and no "Projects" menu link
    And the visitor should see none of the projects the site showed before it read from the panel
    And the rest of the home page should render normally

  Scenario: A failed publish leaves the Projects section unchanged
    Given the Projects section shows the project "Quantum Notes"
    And the owner has saved the new title "Quantum Notes 2"
    And the database cannot be reached
    When the owner chooses "Publish"
    Then the owner should see a message that the publish failed and why
    And a visitor reloading the home page should still see "Quantum Notes" in the Projects section

  Scenario: A publish attempt from outside the signed-in owner changes nothing
    Given the owner has saved the new title "Quantum Notes 2" and has not published
    When someone who is signed out, or signed in with a Google account other than the owner's, asks the site to publish
    Then the site should refuse the request
    And a visitor reloading the home page should still see the previously published projects
```

## Assumptions

1. The Publish button, its owner-only check, its success and failure messages, the kept copy of public pages and the rule that a section with no saved content is hidden with its menu link are built by `owner-publishes-profile`; this story only makes the Projects section use them, and the failure message is that slice's wording. [auto]
2. Publish is one site-wide action, not a Projects-only one: pressing it refreshes every public page, so the owner may publish projects together with other saved changes. [auto]
3. "Within a minute" is measured from the owner seeing the success message to a visitor's reload; the page is refreshed by Publish itself, never on a timer. [human: intent §6]
4. A saved project change is not visible before Publish, except that a code deploy also shows everything saved so far. [human: intent §2.4]
5. The Projects section shows every saved project in the owner's saved order; there is no cap and no paging, and the layout is the one visitors already see (flip cards, three columns on desktop, one on a phone). [auto]
6. A project's GitHub link and demo link are optional: a project with neither shows no link row entry, and one with only one shows only that link. [auto]
7. A project's description paragraphs and tech names show exactly as saved, in the saved order; long text wraps inside the card as it does today. [auto]
8. The projects the site showed from the repo are deleted in this slice, so until the owner re-enters them by hand a public site with no saved projects hides the section and its menu link. [human: intent §2.4]
9. When the database cannot be reached, visitors keep seeing the last published projects; the outage behaviour of every public page is proved in `site-survives-database-outage`, and this story only proves the failed publish. [auto]
10. Publishing on one environment changes only that environment's site; the two-database half is a manual check, not covered here. [human: intent §5]
11. Pressing Publish twice quickly is handled by the button being disabled while it works (built in `owner-publishes-profile`); no extra scenario here. [human: intent §8]
12. Taxonomy sweep. Empty and zero state: scenarios 4 and 5. Boundaries and precision: N/A beyond assumptions 5 and 7, as the panel's own limits on project fields were settled by `owner-manages-projects`. Invalid and malformed input: N/A, the panel refuses invalid projects when saving, so Publish never receives one. Duplicates and collisions: N/A, two projects with the same title are allowed by the panel and both show. State and lifecycle conflicts: scenarios 1 and 4. Persistence failure: scenario 6. Navigation and interruption: N/A, publishing takes no form input, and a visitor's reload is the only navigation. Offline and time: N/A, the Projects section shows no dates. Presentation and scale: assumptions 5 to 7. Multi-actor and permissions: scenario 7; two panel tabs publishing at once is last-write-wins and needs no scenario for one owner. [auto]
13. Projects images are not part of the section, so the image library plays no part in this story. [auto]

## Out of Scope

- A Publish button of its own for projects, or any per-section Publish
- Publishing on a schedule or at a future time
- Previewing unpublished projects on the public site
- A publish history or rollback
- Importing today's projects from the repo into the database; the owner re-enters them by hand
- Changing the look of the Projects section or the project fields
- Keeping the repo's copy of the projects as a fallback

## Deferred

- Behaviour of the Projects section while the database is down at a visit — handled in `site-survives-database-outage`
- Checking that no project content is left anywhere in the repo — checked in `retire-repo-content`
