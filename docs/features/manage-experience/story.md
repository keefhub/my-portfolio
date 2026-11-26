# Manage Experience

```gherkin
Feature: Manage experience entries
  As the site owner
  I want to add, edit, reorder and delete my work and education entries in the admin panel
  So that I can keep my experience current without opening the code

  Scenario: Owner adds the first experience entry and it survives a reload
    Given the owner is signed in and has chosen "Experience" in the menu
    And no experience entries have been saved yet
    And the owner sees a message saying there are no entries yet, with an "Add entry" control
    When the owner chooses "Add entry"
    And fills in year "2027", title "Software Engineer", company "Acme Pte Ltd", duration "Jan 2027 - Present" and description "Built internal tools."
    And adds the detail lines "Shipped a billing dashboard" and "Mentored two interns"
    And chooses "Save"
    Then the owner should see "Software Engineer" at "Acme Pte Ltd" at the top of the list
    And after reloading the page and choosing "Experience" again, the entry should still show all the saved values and both detail lines

  Scenario: Owner edits an existing entry and the change survives a reload
    Given the owner has a saved entry titled "Software Engineer" at "Acme Pte Ltd"
    When the owner opens that entry, changes the company to "Acme Group", removes one detail line and chooses "Save"
    Then the list should show "Software Engineer" at "Acme Group"
    And after reloading the page, the entry should show company "Acme Group" and only the remaining detail line

  Scenario: Owner moves an entry up and the order survives a reload
    Given the owner has saved entries in this order: "Engineer at Alpha", "Engineer at Beta", "Intern at Gamma"
    And "Engineer at Alpha" has no "Move up" control
    And "Intern at Gamma" has no "Move down" control
    When the owner chooses "Move up" on "Intern at Gamma"
    Then the list should read "Engineer at Alpha", "Intern at Gamma", "Engineer at Beta"
    And after reloading the page, the list should still be in that order

  Scenario: Owner deletes an entry after confirming
    Given the owner has saved entries "Engineer at Alpha" and "Engineer at Beta"
    When the owner chooses "Delete" on "Engineer at Beta"
    Then the owner should see a confirmation asking whether to delete "Engineer at Beta"
    And "Engineer at Beta" should still be in the list until the owner confirms
    When the owner confirms the deletion
    Then the list should show only "Engineer at Alpha"
    And after reloading the page, "Engineer at Beta" should not come back

  Scenario: Owner cancels the delete confirmation and the entry stays
    Given the owner has saved entries "Engineer at Alpha" and "Engineer at Beta"
    When the owner chooses "Delete" on "Engineer at Beta"
    And cancels the confirmation
    Then the confirmation should close
    And "Engineer at Beta" should still be in the list in the same position
    And after reloading the page, "Engineer at Beta" should still be there

  Scenario: Owner cannot save an entry with a required field left blank
    Given the owner is adding a new entry
    And has typed a title, a company and a description but left the year blank
    When the owner chooses "Save"
    Then the owner should see a message saying the year is required
    And nothing should be saved
    And the title, company and description the owner typed should still be in the form

  Scenario: Owner manages entries on a 375 pixel wide phone screen
    Given the owner is signed in on a screen 375 pixels wide
    And a saved entry has a company name of 80 characters with no spaces in the middle
    When the owner opens the "Experience" list, an entry's form and a delete confirmation in turn
    Then every screen should be fully usable with no sideways scrolling
    And the long company name should wrap or shorten without hiding the "Edit", "Move up", "Move down" and "Delete" controls
```

## Assumptions

1. Each entry has a year, title, company, duration, description and a list of detail lines, as the Experience section on the home page does today. Year, title, company, duration and description are required; the detail lines are optional.
2. Year and duration are free text, not dates. The panel checks only that they are not blank, so "2026" and "Sep 2026 - Present" are both fine. [auto]
3. A field containing only spaces counts as blank. The panel trims spaces from the start and end of every field before saving. [auto]
4. A blank detail line is dropped on save. It is not an error. [auto]
5. A new entry goes to the top of the list, matching the newest-first order of the Experience section today. The owner can move it afterwards. [auto]
6. Order is changed with "Move up" and "Move down" controls, one step at a time, not by dragging. The top entry has no "Move up" and the bottom entry has no "Move down". [auto]
7. Two entries may share a title and company. Entries have no unique name, so there is no duplicate check. [auto]
8. While a save or delete is in progress the control that started it is disabled, so a double tap saves one entry and deletes once. [auto]
9. There is no length limit on any field. Long text wraps. The owner sees only what the layout does with it, and the layout must not scroll sideways. [auto]
10. A save, move or delete the database refuses or that fails on the network shows an error message and keeps what the owner typed, the same way the profile editor does. The refusal when saving is not yet switched on is the message from the owner-only access feature. This feature adds no wording of its own for it. [auto]
11. A deletion is permanent once confirmed. There is no trash and no undo. [human: intent §2.4]
12. An edit form with unsaved changes loses them on a reload. There is no draft saving or "leave this page?" prompt. [auto]
13. Entries are not tied to one address each. The list and form are views inside the panel, so there is no link to a deleted entry to open. [auto]
14. If the same entry is open in two tabs, the last save wins and the other tab is not warned. [human: intent §8]
15. This feature builds the add, edit, move and confirm-delete behaviour in a form the projects, certifications and tech stack editors reuse, so wording such as "Add entry", "Save", "Move up", "Move down" and "Delete" is shared. [auto]
16. Signed-out and non-owner visitors see no entries. That behaviour, and the owner-only write rules, belong to the sign-in and owner-only access features. This feature relies on them. [auto]
17. Offline and time: the entries hold no dates the panel computes with, so the clock and time zone change nothing. If the connection drops, a save, move or delete fails with the error message of assumption 10 and nothing is changed; the owner retries when back online. A list left open for a long time is not refreshed on its own; choosing "Experience" again or reloading shows the saved entries. [auto]
18. State and lifecycle: an entry is either saved or not; there is no draft, hidden or archived state, and a deleted entry is gone. Opening an entry whose saved copy was deleted from another tab shows the message of assumption 10 on save, and the list drops it on the next load. [auto]

## Out of Scope

- Changing what the home page's Experience section shows. The public site keeps rendering from the code until phase 2.
- Importing the current experience entries from the code. The owner retypes them.
- Dragging entries to reorder them.
- Saving a draft, undoing a delete or restoring a deleted entry.
- Warning about unsaved changes, or about a second tab saving the same entry.
- Validating that the year or duration reads as a date, or that the duration matches the year.
- Hiding an entry without deleting it.
- Image or logo uploads for an entry.
- Selecting several entries to delete or move together.

## Deferred

- Pagination or search of the list. The owner has a handful of entries, so a long list is not a problem yet.
- Conflict detection when two tabs edit the same entry. The owner is the only editor.
