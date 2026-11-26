# Manage Certifications

```gherkin
Feature: Manage certifications
  As the site owner
  I want to add, edit, reorder and delete my certifications in the admin panel
  So that I can keep my credentials current without editing code

  Scenario: Owner adds the first certification to an empty list
    Given the owner is signed in and has opened "Certifications" from the menu
    And no certification has been saved yet
    And the owner sees "No certifications yet" and an "Add certification" control
    When the owner chooses "Add certification"
    And the owner enters the name "Professional Scrum Developer"
    And the owner enters the badge image path "/certs/scrum.png"
    And the owner enters the credential link "https://www.credly.com/badges/example/public_url"
    And the owner saves
    Then the list should show "Professional Scrum Developer"
    And after the owner reloads the page the list should still show "Professional Scrum Developer" with the same badge image path and credential link

  Scenario: Owner edits a saved certification
    Given the owner has opened "Certifications"
    And a certification named "Certified Blockchain Developer" is saved
    When the owner edits it to change the name to "Certified Blockchain Developer (2026)"
    And the owner saves
    Then the list should show "Certified Blockchain Developer (2026)" and no entry named "Certified Blockchain Developer"
    And after the owner reloads the page the list should still show the new name

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
      | name                | badge path       | link                         | message                                   |
      |                     | /certs/scrum.png | https://example.com/cred     | Enter a name                              |
      | Professional Scrum  | /certs/scrum.png | credly.com/badge             | Enter a link that starts with https://    |
      | Professional Scrum  | certs/scrum.png  | https://example.com/cred     | Enter a badge image path that starts with / |

  Scenario: Owner manages certifications on a phone
    Given the owner has opened "Certifications" on a screen 375 pixels wide
    And three certifications with long names are saved
    When the owner adds, edits, moves and deletes a certification
    Then every control should be reachable
    And the page should not scroll sideways
```

## Assumptions

1. A certification has three fields, all required: name, badge image path and credential link. They match what the public Certifications section shows today. `[auto]`
2. The badge image path is text that starts with `/` and points at a file under the site's `public/` folder. The panel does not check that the file exists, because images are not uploaded through the panel. `[human: intent §3, §2.4]`
3. The credential link must start with `https://`. A link that starts with `http://` or has no scheme is refused. `[auto]`
4. A name made only of spaces counts as blank. Leading and trailing spaces are trimmed before saving. `[auto]`
5. Two certifications may have the same name. Nothing identifies a certification except its place in the list. `[auto]`
6. "Move up" and "Move down" buttons change the order. There is no drag and drop. The first entry has no working "Move up" and the last has no working "Move down". `[auto]`
7. A new certification goes to the end of the list. `[auto]`
8. The list, the add and edit form, the reorder controls and the confirmation dialog come from the shared list editor built in `manage-experience`. No spec for that slice exists yet, so this story assumes it offers those four things. `[auto]`
9. Deleting is permanent once the owner accepts the confirmation. There is no undo or trash. `[human: intent §2.4]`
10. A save that fails (network down, or saving not yet switched on) keeps what the owner typed and shows an error, as the shared list editor does for every list. This story adds no failure scenario of its own. `[auto]`
11. When two browser tabs edit the same list, the last save wins. `[human: intent §8]`
12. The panel does not change the public site. The public Certifications section keeps showing the certifications in the code until phase 2. `[human: intent §3]`
13. Edge-case sweep for the categories the scenarios do not cover. `[auto]`
    - Navigation: edits not yet saved are lost when the owner leaves the page or reloads. The panel does not warn, because nothing is stored until the owner saves.
    - Offline and time: a certification has no date or expiry, so time cannot change it. A failed save while offline is covered by assumption 10, and a list that is out of date reloads when the owner opens "Certifications" again.
    - State and lifecycle: a certification is either saved or not. It has no draft, hidden or archived state. A list with one entry has no working "Move up" or "Move down" (assumption 6).
    - Presentation: beyond the phone scenario, long names wrap inside the list and the form, and an empty list shows "No certifications yet".

## Out of Scope

- Uploading or previewing the badge image file
- Checking that the credential link opens or that the badge file exists
- Drag-and-drop reordering
- Undo or a trash for deleted certifications
- Showing the saved certifications on the public site (phase 2)
- Importing today's certifications from the code

## Deferred

- Conflict detection between two tabs or devices — deferred, the intent accepts last save wins
- A badge image thumbnail inside the panel — deferred, it needs the image path to resolve in the panel and adds nothing the owner asked for
