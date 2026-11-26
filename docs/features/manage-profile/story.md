# Manage Profile

```gherkin
Feature: Edit the profile from the admin panel
  As the site owner
  I want to edit my name, headline, about paragraphs, photo path, email, resume link and social links in the panel
  So that I can keep my profile current without opening the code

  Scenario: Owner edits the profile, saves, reloads and sees the saved values
    Given the owner is signed in and saving is switched on
    And the owner has chosen "Profile" in the section menu
    When the owner changes the name, headline, photo path, email and resume link
    And the owner changes the text of an about paragraph
    And the owner chooses "Save"
    Then the owner should see "Profile saved"
    And after the owner reloads the page and chooses "Profile" again, every changed value should show as saved

  Scenario: Owner adds and removes about paragraphs and social links
    Given the owner is signed in and saving is switched on
    And the owner is editing the profile, which has two about paragraphs and two social links
    When the owner adds a third about paragraph and removes the first social link
    And the owner adds a social link with the label "Mastodon" and the address "https://example.social/@keith"
    And the owner chooses "Save"
    And the owner reloads the page and chooses "Profile" again
    Then the owner should see three about paragraphs in the order they were written
    And the owner should see the remaining social link and "Mastodon", but not the removed one

  Scenario: Owner opens the profile before anything has been saved
    Given the owner is signed in and nothing has been saved for the profile yet
    When the owner chooses "Profile" in the section menu
    Then the owner should see every profile field empty
    And the owner should see a message that no profile has been saved yet
    And the owner should see a "Save" control

  Scenario Outline: Owner's save is refused because a value is not acceptable
    Given the owner is signed in and saving is switched on
    And the owner is editing the profile
    When the owner enters <value> as the <field>
    And the owner chooses "Save"
    Then the owner should see the message <message> next to the <field>
    And nothing should be saved
    And everything else the owner typed should still be in the form

    Examples:
      | field        | value                 | message                                   |
      | name         | "   "                 | "Name is required"                        |
      | headline     | ""                    | "Headline is required"                    |
      | email        | "keith-at-example"    | "Enter an email address like name@site.com" |
      | resume link  | "resume please"       | "Enter a web address or a path starting with /" |
      | social link  | "github.com/keefhub"  | "Enter a full web address starting with https://" |

  Scenario: Save fails and the owner keeps what was typed
    Given the owner is signed in and has edited several profile fields
    And saving is not switched on yet
    When the owner chooses "Save"
    Then the owner should see a message that the profile could not be saved and why
    And every edited value should still be in the form
    And after a reload the profile should still show the previous saved values

  Scenario: A signed-in account that is not the owner sees no profile
    Given a Google account that is not the owner's is signed in to the panel
    When that account looks for the profile in the panel
    Then it should see the message that the account is not allowed
    And it should not see any profile field or saved profile value

  Scenario: Owner edits the profile on a phone
    Given the owner is signed in on a screen 375 pixels wide
    When the owner opens "Profile" and adds an about paragraph and a social link
    Then every field and control should be readable and reachable
    And the page should not scroll sideways
```

## Assumptions

1. The profile is one record. There is no list of profiles and nothing to add or delete at the record level (decomposition `manage-profile`). [auto]
2. The fields are name, headline, about paragraphs, photo path, email, resume link and social links (intent §6). Each social link has a label and a web address. [human: intent §6]
3. Name and headline are required. Photo path, email, resume link, about paragraphs and social links may be left empty. [auto]
4. The photo path and the resume link are text. A photo path names a file already in the site's repo and is not checked against the repo's files. A resume link accepts a full web address or a path that starts with "/". [human: intent §2.4] for the photo path, [auto] for the rest.
5. An email must look like an email address. Every social link address must start with "https://". The messages in the examples are the panel's own wording and may change in the spec. [auto]
6. Nothing is prefilled from today's site content. Before the first save the form is empty, and the owner retypes the profile (intent §7). [human: intent §7]
7. A save replaces the whole profile record. The last save wins and two tabs are not checked against each other (intent §8). [human: intent §8]
8. About paragraphs and social links are kept in the order shown on screen. A new one goes at the end. [auto]
9. Unsaved edits are lost on a reload or when the owner leaves "Profile". The panel does not ask before discarding them. [auto]
10. A failed save, for any reason, keeps the owner's input and shows a message. Where the cause is that saving is not switched on, the message says so, as described by `admin-owner-only-access`. [auto]
11. A refused account sees the "not allowed" screen defined by `admin-sign-in` and never reaches the profile form or any stored value (intent §5). [human: intent §5]
12. The form uses the site's existing colour tokens in light and dark themes and works at 375 pixels wide (intent §5, §6). [human: intent §5]
13. Edge-case sweep closes: boundaries and precision have no limits beyond the required fields, so long text simply wraps (covered by the phone scenario). Duplicates and collisions are N/A, since one record has no identity to clash and two identical social links are allowed. State and lifecycle conflicts are N/A, since nothing is retired and a stored record always shows as saved. Offline and time are N/A, since the profile has no dates and an offline save is a failed save, covered above. Multi-actor: one owner, last save wins. [auto]
14. Automated checks use local stand-ins for sign-in and the database, never the live project (intent §4). [human: intent §4]

## Out of Scope

- Changing what visitors see on the public site, which is phase 2
- Uploading or storing a photo or resume file; the fields hold paths and web addresses only
- Importing today's profile text from the site
- Other users, invited editors or permission levels
- Conflict detection between two simultaneous saves

## Deferred

- Moving an about paragraph or a social link up or down, deferred until the owner finds the add-and-remove order too limiting
- A warning before discarding unsaved edits, deferred as the profile is short enough to retype
- Checking that the photo path points at a real file in the repo, deferred, since the panel cannot see the repo's files
