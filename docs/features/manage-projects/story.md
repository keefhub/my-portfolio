# Manage Projects

```gherkin
Feature: Manage projects in the admin panel
  As the site owner
  I want to add, edit, reorder and delete my projects from the admin panel
  So that I can keep my project list current without opening the code

  Scenario: Owner adds a project to an empty list and sees it after a reload
    Given the owner is signed in and has chosen "Projects" from the menu
    And no projects have been saved yet
    And the screen shows "No projects yet"
    When the owner adds a project with title "Kaafei", short description "My side coffee geek", one description paragraph, tech "Next.js" and "Tailwind", and demo link "https://kaafei.org"
    And the owner chooses "Save"
    And the owner reloads the page
    Then the Projects list should show "Kaafei"
    And opening "Kaafei" should show the values the owner entered

  Scenario: Owner edits a saved project and the change survives a reload
    Given a project titled "Kaafei" has been saved
    When the owner changes its title to "Kaafei Coffee" and chooses "Save"
    And the owner reloads the page
    Then the Projects list should show "Kaafei Coffee"
    And the Projects list should not show "Kaafei"

  Scenario: Owner moves a project up and the new order survives a reload
    Given the saved projects are listed in the order "Kaafei", "Portfolio Website", "Recipe Database"
    When the owner chooses "Move up" on "Recipe Database"
    And the owner reloads the page
    Then the Projects list should read "Kaafei", "Recipe Database", "Portfolio Website"

  Scenario: Owner saves a project without a title
    Given the owner is adding a new project
    And the owner has filled in a short description and a demo link but left the title empty
    When the owner chooses "Save"
    Then the owner should see "Title is required"
    And the short description and demo link should still be filled in
    And no new project should appear in the Projects list

  Scenario: Owner deletes a project after confirming
    Given a project titled "Recipe Database" has been saved
    When the owner chooses "Delete" on "Recipe Database"
    And the owner accepts the confirmation
    And the owner reloads the page
    Then the Projects list should not show "Recipe Database"

  Scenario: Owner cancels the delete confirmation
    Given a project titled "Recipe Database" has been saved
    When the owner chooses "Delete" on "Recipe Database"
    And the owner cancels the confirmation
    And the owner reloads the page
    Then the Projects list should still show "Recipe Database"

  Scenario: Owner manages projects on a phone
    Given the owner is signed in on a screen 375 pixels wide
    And three projects have been saved
    When the owner opens the Projects list and then a project's edit form
    Then the page should not scroll sideways on either screen
    And every control, including "Save", "Move up" and "Delete", should be reachable
```

## Assumptions

1. A project has the fields the public Projects section shows today: title, short description, a list of description paragraphs, a list of tech names, a GitHub link and a demo link. [auto]
2. Only the title is required. The short description, paragraphs, tech names and both links may be empty, because three of the current projects have no GitHub link or no demo link. [auto]
3. A link, when filled in, must start with "https://" or "http://". An empty link is saved as empty and never shown as a broken link. [auto]
4. Description paragraphs and tech names are added and removed one at a time, and a blank entry is dropped on save instead of being stored. [auto]
5. Order is set with "Move up" and "Move down" controls, not drag and drop. The first project has no "Move up" and the last has no "Move down". A new project goes to the end of the list. [auto]
6. Deleting a project closes the gap, so the remaining projects keep their relative order. [auto]
7. The list, the edit form and the delete confirmation reuse the pattern from `manage-experience`. No spec for that slice exists yet, so this story assumes it provides a list with "Move up", "Move down" and "Delete" controls and a confirmation that can be accepted or cancelled. [auto]
8. Opening a project loads it from the database each time, so a reload always shows saved values. Unsaved edits are lost on reload, and the form does not warn about that. [auto]
9. Two projects may share a title, because they are told apart by their position. No duplicate check applies. [auto]
10. If a save or delete is refused or fails, for example while the owner's user ID placeholder is still in place, the owner sees the error message the panel already uses for that case, keeps everything typed, and the list does not change. The refusal itself belongs to `admin-owner-only-access`. [auto]
11. A project saved here does not change what visitors see until phase 2 (intent §1, §3). [human: intent §1]
12. Only the owner can reach this screen. Signed-out and non-owner accounts see no projects, which `admin-sign-in` covers. No other roles exist. [human: intent §2.4]
13. Delete is permanent once confirmed, with no trash or undo, and no delete happens without the confirmation. [human: intent §2.4]
14. Image paths are not part of a project today and none is added. [human: intent §3]
15. Edge-case sweep. Boundaries: no limit on the number of projects, paragraphs or tech names is set, and long text wraps inside the form. Offline and time: N/A, no date is involved and a save needs a connection. Navigation: the panel is one page, so there is no deep link to a single project. Multi-actor: one editor and the last save wins, with no conflict detection (intent §8). Presentation: status never depends on colour alone, controls have text labels, and the screens use the site's colour tokens in the light and dark themes. [auto]

## Out of Scope

- Uploading or choosing an image for a project
- Drag and drop reordering
- Undoing a delete or restoring deleted projects
- Importing the projects currently in the code
- Warning about unsaved changes when leaving a form
- Changing what visitors see on the public Projects section

## Deferred

- Showing a project's saved order on the public site — deferred to phase 2, when the public site reads from the database
- Detecting two tabs saving the same project — deferred, the intent accepts last save wins
