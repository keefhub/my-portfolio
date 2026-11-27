# Owner Manages Projects

```gherkin
Feature: Owner manages projects
  As the site owner
  I want to add, edit, reorder and delete my projects from the private panel
  So that I can keep my project list current without touching the code

  Scenario: Owner adds the first project and it is still there after a reload
    Given the owner is signed in and has no saved projects
    And the owner opens the "Projects" screen
    Then the owner should see "No projects yet."
    When the owner chooses "Add entry"
    And the owner fills in the title "Quantum Notes", the short description "A notes app", one description paragraph "Built for fast capture.", the tech names "React" and "Supabase", the GitHub link "https://github.com/example/quantum-notes" and the demo link "https://notes.example.com"
    And the owner chooses "Save"
    Then the owner should see "Entry saved"
    And the "Projects list" should contain "Quantum Notes"
    And after the owner reloads the panel, "Quantum Notes" should still be listed with every value that was entered

  Scenario: Owner edits a saved project and the change survives a reload
    Given the owner is signed in and has a saved project "Quantum Notes"
    When the owner chooses "Edit" on "Quantum Notes"
    And the owner changes the title to "Quantum Notes 2" and removes the demo link
    And the owner chooses "Save"
    Then the owner should see "Entry saved"
    And after the owner reloads the panel, the "Projects list" should contain "Quantum Notes 2" and no project called "Quantum Notes"
    And the saved project should have no demo link

  Scenario: Owner moves a project up and the new order survives a reload
    Given the owner is signed in and has saved projects "Alpha", "Beta" and "Gamma", in that order
    When the owner chooses "Move up" on "Gamma"
    Then the owner should see "Order saved"
    And the "Projects list" should show "Alpha", "Gamma", "Beta", in that order
    And after the owner reloads the panel, the order should still be "Alpha", "Gamma", "Beta"

  Scenario Outline: Owner answers the delete confirmation
    Given the owner is signed in and has saved projects "Alpha" and "Beta"
    When the owner chooses "Delete" on "Beta"
    Then the owner should be asked 'Delete "Beta"? This cannot be undone.'
    And "Beta" should still be listed until the owner answers
    When the owner chooses "<answer>"
    Then "Beta" should be <outcome>
    And after the owner reloads the panel, "Beta" should be <outcome>

    Examples:
      | answer  | outcome            |
      | Confirm | gone from the list |
      | Cancel  | still in the list  |

  Scenario Outline: Owner is told what is wrong with a project that cannot be saved
    Given the owner is signed in and is adding a project
    When the owner enters "<value>" as the <field>
    And the owner chooses "Save"
    Then the owner should see "<message>" next to the <field>
    And everything else the owner typed should still be in the form
    And no project should be added to the list

    Examples:
      | field        | value                 | message                                          |
      | title        |                       | Title is required                                |
      | title        | three spaces          | Title is required                                |
      | GitHub link  | github.com/example/x  | GitHub link must start with https:// or http://  |
      | Demo link    | ftp://demo.example.com | Demo link must start with https:// or http://   |

  Scenario Outline: A request that does not come from the owner is refused
    Given the owner has a saved project "Alpha"
    When <requester> sends a request to <action> directly, without using the panel
    Then the request should be refused
    And no project data should be returned
    And the project "Alpha" should be unchanged, and no project should be added, moved or deleted

    Examples:
      | requester                                                        | action                          |
      | a visitor who is not signed in                                   | ask for the saved projects      |
      | a visitor who is not signed in                                   | add a project                   |
      | a visitor who is not signed in                                   | change the project "Alpha"      |
      | a visitor who is not signed in                                   | move the project "Alpha"        |
      | a visitor who is not signed in                                   | delete the project "Alpha"      |
      | someone signed in with a Google account that is not the owner's  | ask for the saved projects      |
      | someone signed in with a Google account that is not the owner's  | add a project                   |
      | someone signed in with a Google account that is not the owner's  | change the project "Alpha"      |
      | someone signed in with a Google account that is not the owner's  | move the project "Alpha"        |
      | someone signed in with a Google account that is not the owner's  | delete the project "Alpha"      |

  Scenario Outline: Owner is told when the database cannot be reached
    Given the owner is signed in and has a saved project "Alpha"
    And the database cannot be reached
    When the owner <action>
    Then the owner should see "<message>"
    And the owner should not see "No projects yet."
    And "Alpha" should be unchanged once the database can be reached again

    Examples:
      | action                                              | message                              |
      | opens the "Projects" screen                          | The entries could not be loaded.     |
      | saves a new project titled "Beta"                    | The entry could not be saved.        |
      | chooses "Move down" on "Alpha"                       | The entry could not be moved.        |
      | confirms the delete of "Alpha"                       | The entry could not be deleted.      |
```

## Assumptions

1. The screen is called "Projects", and its buttons, messages and confirmation question keep the wording the owner already knows from the earlier panel and from the experience screen: "Add entry", "Edit", "Move up", "Move down", "Delete", "Confirm", "Cancel", "Save", "Entry saved", "Order saved", "Entry deleted", "No projects yet." and `Delete "<title>"? This cannot be undone.`. The scenarios above name the ones they assert. [auto]
2. The behaviour comes from the shared add, edit, reorder and confirm-delete pattern that `owner-manages-experience` builds. No `spec.md` exists for that slice yet, so this story assumes the pattern is reused as it stands and restates only what the Projects screen needs. [auto]
3. A project has a title (required), a short description, any number of description paragraphs, any number of tech names, a GitHub link and a demo link. The short description, links, paragraphs and tech names are optional. [auto]
4. The title is trimmed before it is checked, so a title of only spaces is treated as empty. Each link, if given, must start with `https://` or `http://`, in any letter case. A blank paragraph or tech name is dropped on save. [auto]
5. A new project goes to the bottom of the list, which is the same order the public Projects section reads top to bottom. Moving a project swaps it with its neighbour. "Move up" is not offered on the first project and "Move down" is not offered on the last. [auto]
6. Confirming a delete removes the project for good. There is no trash and no undo. [human: intent §2.4]
7. Only the owner's verified Google account can read, create, change, reorder or delete projects. A signed-out visitor and any other Google account are refused, including when a request is sent without the panel, and are shown no project data. Reading the saved list is refused to them as well. [human: intent §5]
8. Category 1 (empty): with no saved projects the screen shows "No projects yet." and the "Add entry" button, which is different from the "could not be loaded" message shown when the database is unreachable. [auto]
9. Category 2 (boundaries): there is no limit on the number of projects, the length of a field or the number of paragraphs and tech names. A long title or paragraph wraps instead of overflowing, on a phone as well as a desktop. [auto]
10. Category 4 (duplicates): two projects may share a title, because each has its own identity. Pressing "Save", "Move up", "Move down" or "Confirm" twice in a row acts once, because the buttons are disabled while the request runs. [auto]
11. Category 5 (lifecycle): if a project was deleted in another tab and the owner then saves an edit to it, the save fails with the save-failed message and the project is not recreated. The last save wins when two tabs edit the same project, with no conflict warning. [human: intent §8]
12. Category 6 (persistence failure): when a save fails, the form stays open with everything the owner typed. A failed load shows an error and never the empty-list message. The public site keeps working, because it reads its projects from the repo. [human: intent §2.5]
13. Category 7 (navigation): the owner's unsaved form input is lost on a reload or when the owner leaves the "Projects" screen. Choosing "Cancel" in the form closes it without saving. [auto]
14. Category 8 (offline and time): going offline after the screen has loaded behaves like an unreachable database. No date or time is shown or edited on this screen. [auto]
15. Category 9 (presentation): the screen uses the site's colour tokens in light and dark themes. Every control can be reached and used from the keyboard, and messages are announced to screen readers and never shown by colour alone. [human: intent §5]
16. Category 10 (multi-actor): the panel has one editor, the owner. The refused-request scenario covers every other actor. [human: intent §2.4]
17. When the free database project has paused, the screen shows the same "could not be loaded" message as any unreachable database, and sign-in still works. [human: intent §4]

## Out of Scope

- Changing what the public Projects section shows. The public pages keep reading their projects from the repo.
- Importing projects from the old panel or from the repo. The database starts empty and the owner retypes content.
- Project images, screenshots or icons.
- Bulk delete, bulk reorder, drag-and-drop reordering and undoing a delete.
- A search, filter or page-by-page view of the project list.
- Warning the owner when two tabs edit the same project.
- Any screen other than Projects. Experience, Certifications, Tech stack, Blog posts, Images and Profile have their own stories.

## Deferred

- Public pages reading projects from the database. The intent keeps that as a later goal.
- A separate "featured" project or hidden-project flag. Nobody asked for one, and it needs a change to the public section as well.
