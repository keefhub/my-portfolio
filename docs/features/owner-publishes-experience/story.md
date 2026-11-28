# Owner Publishes Experience

```gherkin
Feature: Owner publishes experience
  As the owner
  I want the Experience section to show the entries I saved in the panel once I press Publish
  So that I can update my work history without changing code or redeploying

  Scenario: Owner adds an entry and publishes it
    Given the owner is signed in to the panel
    And the owner has added an Experience entry with Year "2027", Title "Senior Engineer", Company "Acme Pte Ltd", Duration "Jan 2027 - Present" and Description "Leads the platform team."
    When the owner presses "Publish"
    Then a visitor opening the landing page should see "Senior Engineer" at "Acme Pte Ltd" in the Experience section
    And the entry should show "Jan 2027 - Present" and "Leads the platform team."

  Scenario: Visitors do not see a saved change before Publish
    Given a published Experience entry reads "Software Engineer" at "Acme Pte Ltd"
    And the owner has changed its Title to "Staff Engineer" and saved it
    When a visitor opens the landing page
    Then the visitor should see "Software Engineer" at "Acme Pte Ltd"
    And the visitor should not see "Staff Engineer"

  Scenario: Visitors see the entries in the order the owner set
    Given the owner has saved the entries "Intern" and "Engineer" in that order
    And both entries are published
    When the owner chooses "Move down" on "Intern"
    And the owner presses "Publish"
    Then a visitor opening the landing page should see "Engineer" listed before "Intern"

  Scenario: Visitor opens an entry that has no detail lines
    Given a published Experience entry "Engineer" at "Acme Pte Ltd" has a Description and no detail lines
    When a visitor opens that entry's card
    Then the visitor should see the Description and the Duration of the entry
    And the visitor should not see an empty list of points

  Scenario: Visitors see no Experience entries before the owner has saved any
    Given the owner has never saved an Experience entry
    When a visitor opens the landing page
    Then the visitor should not see the work-history timeline
    And the visitor should not see "Resorts World Sentosa", "NCS" or any other entry that was written into the site before
    And the rest of the landing page should show as usual

  Scenario: Owner deletes every entry and publishes
    Given the owner has published two Experience entries
    And the owner has deleted both entries and confirmed each delete
    When the owner presses "Publish"
    Then a visitor opening the landing page should not see the work-history timeline
    And the rest of the landing page should show as usual
```

## Assumptions

1. The Publish button, its owner-only check, its failure message, the kept last good copy and the rule that a section with no content is hidden together with its menu link all come from `owner-publishes-profile`. This story adds only the Experience entries to what Publish refreshes. Its spec did not exist when this story was written, so the button label "Publish" is taken from the decomposition and must be confirmed against that spec. [auto]
2. Visitors see the entries in the order of the panel's Experience list, not sorted by Year. The owner controls the order with "Move up" and "Move down". [auto]
3. The Experience menu link and the Tech Stack block share one section of the landing page. The link is hidden only when both Experience and Tech Stack have nothing to show. Tech Stack still shows the content written into the site until `owner-publishes-tech-stack` ships, so the link stays in this slice when the timeline is hidden. [auto]
4. When there are no entries the timeline is not shown and no placeholder text replaces it. [human: intent §2.4]
5. An entry with no detail lines is allowed, since the panel lets the owner leave them out. The card still turns over and shows the Description and Duration, with no list. [auto]
6. Year, Duration and the text lines are shown exactly as saved. Duration is free text, so no date formatting applies. [auto]
7. The Experience entries written into the site's code are deleted by this slice. The pull request lists the commit so the owner can re-enter them by hand. [human: intent §2.4]
8. A saved change is not visible until Publish. A code deploy also shows everything saved so far, which the owner accepts. [human: intent §2.4]
9. Publish shows the entries saved at the moment it is pressed. A second browser tab with older unsaved edits changes nothing, since only saved entries are published. [auto]
10. A failed Publish leaves the Experience section as it was, with the panel's failure message from `owner-publishes-profile`. This story adds no scenario for it because the failure behaviour is one shared mechanism and is tested there. [auto]
11. Long titles, companies and descriptions wrap inside the card on a phone as they do today, and the card layout, motion and keyboard behaviour do not change. [auto]
12. The checks in the sweep that do not apply: dates and time zones (Duration is free text), duplicates (the panel allows two entries with the same Title and Company, and both are shown), and retired items (deleting an entry removes it from the public page only after the next Publish). Also not applicable: invalid and malformed input (N/A — the panel's Experience editor already validates and limits what can be saved, and Publish shows only saved entries as plain text, so there is no new input to check here) and navigation and interruption (N/A — Publish is one action owned by `owner-publishes-profile`; if the owner leaves or closes the panel while it runs, the last good published copy stays until a later Publish succeeds, and visitors' pages are prerendered so a visitor leaving mid-load changes nothing). [auto]
13. Only the owner publishes, so no second editor or visitor action can conflict with a Publish. A visitor's own device has nothing stored for this section. [auto]

## Out of Scope

- A Publish button, its owner check and its failure message, which belong to `owner-publishes-profile`
- Showing Tech Stack from the database, which belongs to `owner-publishes-tech-stack`
- Sorting entries by Year or Duration automatically
- A preview of unsaved or unpublished entries
- Publishing a single section on its own
- A publish history or a way to undo a Publish
- Importing today's entries; the owner re-enters them by hand

## Deferred

- Hiding the Experience menu link when Tech Stack is also empty, proven in `owner-publishes-tech-stack`, because Tech Stack still shows written-in content here
- Visitors keeping the last published entries while the database is unreachable, proven for every section in `site-survives-database-outage`
