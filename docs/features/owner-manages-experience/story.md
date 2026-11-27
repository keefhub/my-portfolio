# Owner Manages Experience

```gherkin
Feature: Owner manages experience
  As the site owner
  I want to add, edit, reorder and delete my experience entries in the private panel
  So that the work history I keep is stored in my own database and I can change it without touching the code

  Scenario: Owner adds the first experience entry
    Given the owner is signed in and opens the "Experience" screen
    And no experience entries have been saved yet
    And the screen shows "No entries yet."
    When the owner chooses "Add entry", fills in Year "2024", Title "Software Engineer", Company "Acme", Duration "Jan 2024 - Present" and Description "Built the billing service.", adds the detail line "Cut invoice errors by 40%" and chooses "Save"
    Then the owner should see "Entry saved"
    And the list should show "Software Engineer at Acme"
    And after the owner reloads the page the list should still show "Software Engineer at Acme"

  Scenario: Owner edits an existing entry and its detail lines
    Given the "Experience" screen lists "Software Engineer at Acme" with the detail line "Cut invoice errors by 40%"
    When the owner chooses "Edit", changes Title to "Senior Software Engineer", removes the detail line and chooses "Save"
    Then the owner should see "Entry saved"
    And the list should show "Senior Software Engineer at Acme"
    And after the owner reloads the page the entry should still be titled "Senior Software Engineer" and have no detail lines

  Scenario: Owner moves an entry down and the new order survives a reload
    Given the "Experience" screen lists "Software Engineer at Acme" first and "Analyst at Beta" second
    And "Move up" is not offered on the first entry and "Move down" is not offered on the last entry
    When the owner chooses "Move down" on "Software Engineer at Acme"
    Then the owner should see "Order saved"
    And the list should show "Analyst at Beta" first and "Software Engineer at Acme" second
    And after the owner reloads the page the list should show the same order

  Scenario Outline: Owner's answer to the delete question decides whether the entry is removed
    Given the "Experience" screen lists "Software Engineer at Acme"
    And the owner has chosen "Delete" on that entry
    And the owner sees "Delete "Software Engineer at Acme"? This cannot be undone."
    When the owner chooses "<answer>"
    Then the list "<result>" "Software Engineer at Acme"
    And after the owner reloads the page the list "<result>" "Software Engineer at Acme"

    Examples:
      | answer  | result           |
      | Cancel  | still shows      |
      | Confirm | no longer shows  |

  Scenario Outline: Owner leaves a required field empty
    Given the owner is filling in the "Add entry" form with every other field completed
    And the owner has entered <entered> in "<field>"
    When the owner chooses "Save"
    Then the owner should see "<message>" next to "<field>"
    And the other fields should still hold what the owner typed
    And no entry should be added

    Examples:
      | field       | entered     | message                  |
      | Year        | nothing     | Year is required         |
      | Title       | only spaces | Title is required        |
      | Company     | nothing     | Company is required      |
      | Duration    | only spaces | Duration is required     |
      | Description | nothing     | Description is required  |

  Scenario Outline: Someone other than the owner tries to change the experience entries directly
    Given the "Experience" screen lists "Software Engineer at Acme"
    And <actor> sends a request to add, change, move or delete an experience entry without using the panel
    When the request reaches the site
    Then the request should be refused
    And the owner should still see exactly the same entries in the same order and with the same wording

    Examples:
      | actor                                              |
      | a visitor who is not signed in                     |
      | someone signed in with a Google account that is not the owner's |

  Scenario: Owner opens the Experience screen while the database cannot be reached
    Given the content database cannot be reached
    When the owner opens the "Experience" screen
    Then the owner should see "The entries could not be loaded."
    And the owner should not see "No entries yet."
    And the owner should not be offered "Add entry"
```

## Assumptions

1. This screen replaces the "not available yet" notice that the Experience menu item shows after sign-in moves and before this feature ships (decomposition Decision 3 [auto]). [auto]
2. The database, the owner-only check on every request and the unreachable-database handling come from `owner-edits-profile`. It has no `spec.md` yet, so this story assumes it provides them and adds only the experience entries on top. [auto]
3. Each entry has Year, Title, Company, Duration, Description and a list of detail lines, exactly the fields the earlier panel had. Year and Duration are free text, not dates. [auto]
4. The five required-field messages are the earlier panel's: "Year is required", "Title is required", "Company is required", "Duration is required" and "Description is required". Surrounding spaces are trimmed before the check. Blank detail lines are dropped on save and are never an error. [auto]
5. The same rules apply on the server as in the form, so a direct request with a blank required field is refused as well. [auto]
6. A new entry goes to the top of the list. "Move up" and "Move down" swap an entry with its neighbour, and the order is stored. [auto]
7. Each row shows "Title at Company". The delete question is `Delete "<Title> at <Company>"? This cannot be undone.` with "Confirm" and "Cancel". [auto]
8. A confirmed delete is permanent. There is no trash and no undo. [human: intent §2.4]
9. Only a signed-in Google account matching the owner's setting can add, change, move or delete an entry. Everyone else is refused, including a request sent without the panel. [human: intent §5]
10. The new database starts empty. Nothing is imported, so the first view is "No entries yet." and the owner retypes any entries they want. [human: intent §8]
11. Two entries with identical text are allowed. Nothing in the data makes an entry unique, and the owner can delete either one. [auto]
12. While a save, move or delete is running, the controls are disabled, so choosing "Save" twice quickly stores one entry. [auto]
13. A save, move or delete that fails after the form validated keeps the form open with everything the owner typed and shows "The entry could not be saved.", "The entry could not be moved." or "The entry could not be deleted." The entry list does not change. The same message appears when the owner's sign-in has ended or the entry was deleted from another tab. A save of an entry that no longer exists does not bring it back. [auto]
14. "Cancel" on the form returns to the list and saves nothing. Reloading with a form open loses what was typed, and nothing is kept as a draft. [auto]
15. One owner edits at a time. If two tabs change the same entry, the last save wins and there is no conflict warning. [auto]
16. Text of any length is accepted and wraps inside the row. There is no cap on the number of entries or detail lines, and the screen shows all of them without paging. [auto]
17. The form and list keep the earlier panel's layout, colour tokens in light and dark, labelled fields and keyboard use. They work at phone width without sideways scrolling. [auto]
18. The public landing page keeps showing the experience that is in the repository, whether or not the database can be reached. [human: intent §3]
19. The add, edit, reorder and delete behaviour, messages and wording are shared with the Projects, Certifications and Tech stack screens, which are built next. Fixing them here is what this feature is for. [auto]
20. Going offline after the screen has loaded behaves like an unreachable database: the next save, move or delete shows its failure message from assumption 13 and keeps what the owner typed. No date or time is edited here, so time zones do not apply. [auto]

## Out of Scope

- Showing the saved entries on the public landing page, which keeps reading the repository (intent §3)
- Importing the experience that is in the repository today into the database (intent §8)
- Dragging entries to reorder them, or sorting them by year
- Hiding an entry without deleting it, undoing a delete, or any trash
- Conflict warnings when two tabs edit the same entry
- Saving a draft of an unfinished form
- Any change to the other screens in the panel
- Experience entries for anyone but the owner, or editing by another account

## Deferred

- Paging or searching the entry list. The owner keeps a handful of entries, so it is not needed yet.
- A warning when a second tab changed an entry. The owner is the only editor.
