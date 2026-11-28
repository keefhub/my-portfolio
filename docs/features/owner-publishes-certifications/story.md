# Owner Publishes Certifications

```gherkin
Feature: Owner publishes certifications
  As the site owner
  I want to publish the certifications I saved in the panel
  So that visitors see them in the Certifications section, or no section at all when I have none

  Scenario: Owner publishes saved certifications and visitors see them in the owner's order
    Given the owner has saved the certifications "Professional Scrum Developer" and "Certified Blockchain Developer" in that order
    And a visitor has the public page open with no Certifications section
    When the owner presses "Publish" in the panel
    And the visitor opens the public page again
    Then the visitor should see a "Certifications" section with "Professional Scrum Developer" followed by "Certified Blockchain Developer"
    And each certification should show its badge image
    And each certification should link to its credential in a new tab
    And the menu should show a "Certifications" link

  Scenario: Owner publishes a certification whose badge is an uploaded image
    Given the owner has saved a certification "Google IT Automation with Python" whose badge is an uploaded image
    When the owner presses "Publish" in the panel
    And the visitor opens the public page
    Then the visitor should see the uploaded image as the badge of "Google IT Automation with Python"

  Scenario: A saved change is not visible until the owner publishes
    Given the public page shows the certification "Professional Scrum Developer"
    And the owner has renamed it to "Professional Scrum Developer II" and saved without pressing "Publish"
    When the visitor opens the public page
    Then the visitor should still see "Professional Scrum Developer"
    And the visitor should not see "Professional Scrum Developer II"

  Scenario: Owner publishes a changed name and a new order
    Given the public page shows "Professional Scrum Developer" followed by "Certified Blockchain Developer"
    And the owner has renamed the second certification to "Certified Blockchain Developer 2" and moved it to the top
    When the owner presses "Publish" in the panel
    And the visitor opens the public page
    Then the visitor should see "Certified Blockchain Developer 2" followed by "Professional Scrum Developer"
    And the visitor should not see "Certified Blockchain Developer" under its old name

  Scenario: Owner deletes every certification and publishes
    Given the public page shows a "Certifications" section and a "Certifications" menu link
    And the owner has deleted every certification in the panel
    When the owner presses "Publish" in the panel
    And the visitor opens the public page
    Then the visitor should not see the "Certifications" section
    And the menu should not show a "Certifications" link
    And the other sections of the page should show as before

  Scenario: A site with no saved certifications shows no Certifications section
    Given the owner has never saved a certification
    When the visitor opens the public page
    Then the visitor should not see the "Certifications" section
    And the menu should not show a "Certifications" link
    And the page should show no error
```

## Assumptions

1. The Publish button, the owner-only publish request, the refusal of anyone who is not the owner, the failure message and the kept copy of the public page come from `owner-publishes-profile`; this story adds only the Certifications section's content. No spec for that slice exists yet, so this story relies on its behaviour as the decomposition describes it. [auto]
2. A certification shows its name, its badge image and a link to its credential, as the section does today. The credential link opens in a new tab and the hover text "View Credential" stays. [auto]
3. Visitors see certifications in the order the owner set in the panel, first to last. [auto]
4. When the owner has no saved certification, the whole section and the "Certifications" menu link are hidden and nothing replaces them, such as a message or an empty box. This rules the same way as "Deleted all" and "Never saved". [human: intent §2.4]
5. A badge picked from the uploaded images shows as that image, and a badge typed as a path in the site's public files shows that file. Both look the same to a visitor. [auto]
6. A saved change, a delete or a reorder stays invisible to visitors until the owner presses "Publish". A code deploy also shows everything saved so far. [human: intent §2.4]
7. Persistence failure is covered by `owner-publishes-profile` (a failed publish shows a message in the panel and the public page stays as it was) and by `site-survives-database-outage` (the public page when the database cannot be reached). This story adds no scenario for either. [auto]
8. A certification whose badge image has since been deleted from the uploaded images shows a broken image, as it does today; the story adds no fallback. [auto]
9. Long certification names wrap inside their card and the three-column layout folds to one column on a phone, as the section does today. This story adds no new layout. [auto]
10. The refresh after Publish reaches only the site the owner is signed in to, so a publish on SIT does not change live. [human: intent §2.4]
11. Sections other than Certifications keep their own publish behaviour. Deleting every certification changes none of them. [auto]
12. Two panel tabs, or a second owner session, are not a case: one owner edits at a time, and the last Publish wins. [auto]
13. Dates, offline use, duplicate names and invalid input do not arise here. The panel already refuses a nameless certification, a bad link and a missing badge, and the section shows no date. Two certifications with the same name are both shown, as the panel allows them. Navigation and interruption: N/A — a visitor who leaves the page mid-load or an owner who closes the panel while "Publishing…" adds nothing specific to certifications; the public page is a static page, and an interrupted Publish is covered by `owner-publishes-profile`, which keeps the previous copy until a publish completes. [auto]

## Out of Scope

- Editing, adding, reordering or deleting certifications in the panel (built by `owner-manages-certifications`)
- The Publish button, its owner-only check and the failure message (built by `owner-publishes-profile`)
- Hiding the section when the database cannot be reached (`site-survives-database-outage`)
- Removing the hard-coded certifications from the repository's docs and checking that nothing is left (`retire-repo-content`)
- A one-time import of today's three certifications; the owner enters them by hand
- A preview of unpublished certifications, a publish history or a rollback
- A fallback image for a badge that no longer exists
- Publishing certifications on their own, apart from the rest of the site

## Deferred

None.
