# Owner Manages Certifications

```gherkin
Feature: Owner manages certifications
  As the site owner
  I want to add, edit, reorder and delete my certifications in the private panel
  So that I can keep my credentials current without editing code

  Scenario Outline: Owner adds the first certification to an empty list with a badge from either source
    Given the owner is signed in with their own Google account and has opened "Certifications" from the menu
    And no certification has been saved yet
    And the owner sees "No certifications yet." and an "Add certification" control
    And the owner has uploaded an image "scrum-badge.png" in "Images"
    When the owner chooses "Add certification"
    And the owner enters the name "Professional Scrum Developer"
    And the owner gives the badge image by <badge source>
    And the owner enters the credential link "https://www.credly.com/badges/example/public_url"
    And the owner saves
    Then the list should show "Professional Scrum Developer" with its badge image
    And after the owner reloads the page the list should still show "Professional Scrum Developer" with the same badge image and credential link

    Examples:
      | badge source                                  |
      | choosing the uploaded image "scrum-badge.png" |
      | entering the repo path "/certs/scrum.png"     |

  Scenario: Owner edits a saved certification and gives it an uploaded badge image
    Given the owner has opened "Certifications"
    And a certification named "Certified Blockchain Developer" is saved with the badge image path "/certs/blockchain.png"
    And the owner has uploaded an image "blockchain-badge.png" in "Images"
    When the owner edits it to change the name to "Certified Blockchain Developer (2026)"
    And the owner chooses the uploaded image "blockchain-badge.png" as its badge image
    And the owner saves
    Then the list should show "Certified Blockchain Developer (2026)" with the image "blockchain-badge.png" and no entry named "Certified Blockchain Developer"
    And after the owner reloads the page the list should still show the new name and the uploaded image
    And a visitor who is not signed in can open the uploaded image at its address

  Scenario: Owner changes the order of certifications
    Given the owner has opened "Certifications"
    And the saved certifications are "Professional Scrum Developer", "Google IT Automation with Python" and "Certified Blockchain Developer", in that order
    When the owner moves "Certified Blockchain Developer" up once
    Then the list should show "Professional Scrum Developer", "Certified Blockchain Developer" and "Google IT Automation with Python", in that order
    And after the owner reloads the page the list should show the same order

  Scenario: Owner deletes a certification after confirming
    Given the owner has opened "Certifications"
    And a certification named "Google IT Automation with Python" is saved
    When the owner chooses to delete "Google IT Automation with Python"
    And the owner accepts the confirmation
    Then the list should no longer show "Google IT Automation with Python"
    And after the owner reloads the page the list should still not show it

  Scenario: Owner cancels the delete confirmation
    Given the owner has opened "Certifications"
    And a certification named "Google IT Automation with Python" is saved
    When the owner chooses to delete "Google IT Automation with Python"
    And the owner cancels the confirmation
    Then the list should still show "Google IT Automation with Python"
    And after the owner reloads the page the list should still show it

  Scenario Outline: Owner tries to save a certification with a missing or malformed field
    Given the owner is adding a certification
    When the owner enters the name "<name>"
    And the owner enters the badge image path "<badge path>"
    And the owner enters the credential link "<link>"
    And the owner saves
    Then the owner should see the message "<message>"
    And the certification should not be saved
    And the form should still hold what the owner typed

    Examples:
      | name               | badge path       | link                     | message                                                                    |
      |                    | /certs/scrum.png | https://example.com/cred | Enter a name                                                               |
      | (three spaces)     | /certs/scrum.png | https://example.com/cred | Enter a name                                                               |
      | Professional Scrum | /certs/scrum.png | credly.com/badge         | Enter a link that starts with https://                                     |
      | Professional Scrum | /certs/scrum.png | http://example.com/cred  | Enter a link that starts with https://                                     |
      | Professional Scrum | certs/scrum.png  | https://example.com/cred | Enter a badge image path that starts with /                                |
      | Professional Scrum |                  | https://example.com/cred | Pick an uploaded image or enter a badge image path that starts with /      |

  Scenario Outline: A request to change certifications from anyone but the owner is refused
    Given a certification named "Google IT Automation with Python" is saved
    And <sender> sends a request without using the panel
    When the request is to <action>
    Then the request should be refused
    And after the owner reloads "Certifications" the list should show "Google IT Automation with Python" exactly as before, with no other change

    Examples:
      | sender                                                         | action                                                       |
      | a visitor who is not signed in                                 | add a certification named "Fake Certificate"                 |
      | a visitor who is not signed in                                 | delete "Google IT Automation with Python"                    |
      | someone signed in with a Google account that is not the owner's | rename "Google IT Automation with Python" to "Hacked"        |
      | someone signed in with a Google account that is not the owner's | move "Google IT Automation with Python" up                   |
```

## Assumptions

1. A certification has three fields, all required: name, badge image (uploaded or repo path) and credential link. They match what the public Certifications section shows today. `[auto]`
2. The badge image is either an image chosen from the owner's uploaded images or a repo path. A repo path is text that starts with `/` and points at a file in the site's public files; the panel does not check that the file exists. The form shows both sources, and the badge is whichever was set last. `[human: intent §2.4, §6]`
3. The credential link must start with `https://`. A link that starts with `http://` or has no scheme is refused. `[auto]`
4. A name made only of spaces counts as blank. Leading and trailing spaces are trimmed before saving. `[auto]`
5. Two certifications may have the same name. Nothing identifies a certification except its place in the list. `[auto]`
6. "Move up" and "Move down" buttons change the order. There is no drag and drop. The first entry has no working "Move up" and the last has no working "Move down". `[auto]`
7. A new certification goes to the end of the list. `[auto]`
8. The list, the add and edit form, the reorder controls, the delete confirmation and the message for an unreachable database come from the shared list editor built in `owner-manages-experience`. No spec for that slice exists yet, so this story assumes it offers all of these and that it saves each change before it shows it as done. `[auto]`
9. The "Images" screen and its uploaded images come from `owner-uploads-images`, which has no spec yet. This story assumes an uploaded image has a public address that anyone can open, and that the picker lists the uploaded images by file name. `[auto]`
10. Deleting is permanent once the owner accepts the confirmation. There is no undo or trash. `[human: intent §2.4]`
11. Only the owner's verified Google account may add, change, move or delete a certification. The server refuses every other request, including one sent without the panel, and the refusal changes nothing. `[human: intent §5]`
12. When two browser tabs edit the same list, the last save wins. `[human: intent §8]`
13. The panel does not change the public site. The public Certifications section keeps showing the certifications in the repo. The new database starts empty and the owner retypes the certifications; nothing is imported. `[human: intent §3, §8]`
14. When the database is unreachable (for example a paused free Supabase project), the panel says so and keeps what the owner typed. The public site and sign-in keep working. `[human: intent §4]`
15. Deleting an uploaded image in "Images" does not change a certification that uses it. The certification keeps its saved address and its badge shows as a broken image until the owner picks another. The panel does not check this. `[auto]`
16. The Save control is disabled while a save is running, so pressing it twice saves one certification. `[auto]`
17. Edge-case sweep for the categories the scenarios do not cover. `[auto]`
    - Empty and zero state: closed by the first scenario ("No certifications yet." and "Add certification").
    - Boundaries: the list has no maximum size and a name has no length limit beyond what the form accepts. Five or fewer people use the panel, so long lists get no paging.
    - Invalid input: closed by the field-error scenario. The server repeats the same checks and a refused save shows the same message.
    - Duplicates: closed by assumptions 5 and 16.
    - State and lifecycle: a certification is either saved or not. It has no draft, hidden or archived state. Assumption 15 covers an uploaded image deleted later.
    - Persistence failure: closed by assumptions 8 and 14. A failed save keeps what the owner typed and shows an error. This story adds no failure scenario of its own.
    - Navigation: edits not yet saved are lost when the owner leaves the page or reloads. The panel does not warn, because nothing is stored until the owner saves.
    - Offline and time: N/A — a certification has no date or expiry, so time cannot change it. A save while offline fails as in assumption 14, and a list that is out of date reloads when the owner opens "Certifications" again.
    - Presentation: N/A — the form uses the shared list editor's layout and the same field styles as the other lists, and its phone layout is checked in `owner-manages-experience`. Long names wrap inside the list and the form. The panel uses the site's colour tokens in light and dark themes.
    - Multi-actor: closed by the refusal scenario and assumptions 11 and 12.

## Out of Scope

- Uploading images from the certification form (uploads happen in "Images")
- Previewing the badge image file inside the panel
- Checking that the credential link opens or that the badge file exists
- Drag-and-drop reordering
- Undo or a trash for deleted certifications
- Showing the saved certifications on the public site (a later goal)
- Importing today's certifications from the repo
- Other users, invited editors or permission levels

## Deferred

- Conflict detection between two tabs or devices, deferred because the intent accepts last save wins
- A badge image thumbnail inside the panel, deferred because it adds nothing the owner asked for
