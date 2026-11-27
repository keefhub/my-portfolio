# Owner Edits Profile

```gherkin
Feature: Owner edits profile
  As the site owner
  I want to edit my name, headline, about paragraphs, photo, email, resume link and social links in the panel and save them
  So that my profile is kept safely, is still there after a reload, and nobody else can change it

  Scenario: Owner edits the profile, saves it and finds it again after a reload
    Given the owner is signed in and has chosen "Profile"
    And a profile has been saved before
    When the owner sets Name to "Keith Lim" and Headline to "Software Engineer"
    And the owner sets the About paragraphs to "First paragraph." and "Second paragraph."
    And the owner sets Photo path to "/images/keith.jpg", Email to "hello@example.com" and Resume link to "/resume.pdf"
    And the owner adds a social link with label "GitHub" and address "https://github.com/example"
    And the owner chooses "Save"
    Then the owner sees "Profile saved"
    When the owner reloads the page and chooses "Profile"
    Then every field shows the value the owner saved, with the About paragraphs and the social link in the same order

  Scenario: Owner opens the profile before any profile has been saved
    Given the owner is signed in and nothing has ever been saved in the panel
    When the owner chooses "Profile"
    Then the owner sees "No profile has been saved yet."
    And the owner sees the form with every field empty and no paragraphs or social links
    When the owner fills in Name "Keith Lim" and Headline "Software Engineer" and chooses "Save"
    Then the owner sees "Profile saved"
    And the message "No profile has been saved yet." is gone

  Scenario Outline: Owner enters a value that is refused and nothing is saved
    Given the owner is signed in and has chosen "Profile"
    And the stored profile has Name "Keith Lim"
    When the owner enters <value> for <field> and chooses "Save"
    Then the owner sees "<message>" beside <field>
    And the other fields still show what the owner typed
    And "Profile saved" is not shown
    And after a reload the stored profile still has Name "Keith Lim"

    Examples:
      | field               | value                   | message                                          |
      | Name                | only spaces             | Name is required                                 |
      | Headline            | only spaces             | Headline is required                             |
      | Email               | "not-an-email"          | Enter an email address like name@site.com        |
      | Resume link         | "resume.pdf"            | Enter a web address or a path starting with /    |
      | a social link address | "github.com/example"  | Enter a full web address starting with https://  |

  Scenario Outline: A request to read or change the profile from anyone but the owner is refused
    Given the stored profile has Name "Keith Lim"
    When <requester> sends a request <request> directly, without using the panel
    Then the request is refused
    And the response contains no profile content
    And after the owner reloads the panel, the stored profile still has Name "Keith Lim"

    Examples:
      | requester                                              | request                                    |
      | a visitor who is not signed in                         | to save a profile with Name "Defaced"      |
      | a visitor who is not signed in                         | to read the profile                        |
      | a visitor signed in with a Google account that is not the owner's | to save a profile with Name "Defaced" |
      | a visitor signed in with a Google account that is not the owner's | to read the profile                   |

  Scenario: The profile cannot be loaded because the database cannot be reached
    Given the owner is signed in
    And the database cannot be reached
    When the owner chooses "Profile"
    Then the owner sees "The profile could not be loaded."
    And the owner sees no form and no profile content
    And the message shows no database address, password, key or error text
    And the owner still sees the menu and a "Sign out" control
    And the public landing page still loads with the same content as before

  Scenario: The profile cannot be saved because the database cannot be reached
    Given the owner is signed in and has chosen "Profile"
    And the owner has changed Headline to "Staff Engineer"
    And the database cannot be reached
    When the owner chooses "Save"
    Then the owner sees "The profile could not be saved. Try again, and check that you are signed in as the owner."
    And the Headline field still shows "Staff Engineer"
    And "Profile saved" is not shown

  Scenario: Saving the profile does not change the public site
    Given the landing page shows the name and about text it was built with
    And the owner has saved a profile with Name "Someone Else"
    When a visitor opens the landing page
    Then the visitor sees the same name and about text as before the owner saved
```

## Assumptions

1. This feature builds on the owner sign-in feature: the "Profile" menu item, the owner-only check on the verified email setting and the "Sign out" control already exist, and the notice "Profile editor is not available yet." is replaced by the editor. No spec for that feature was available, so this is taken from its decomposition entry. [auto]
2. The profile is one record. "Save" replaces the whole of it, the last save wins, and a second browser tab that saves later overwrites the first without any notice. [human: intent §8]
3. The fields and rules are the earlier panel's, with its wording. Name and Headline are required. Email, Resume link and Photo path may be left empty. Email must look like an email address. Resume link must be a web address or a path starting with "/". Each social link address must be a full address starting with "https://". Photo path has no format check. [human: intent §8]
4. Saving removes surrounding spaces, drops empty About paragraphs and drops a social link whose label and address are both empty. A social link with an address and no label is kept. [auto]
5. The photo is typed by hand as a path or address in this feature. The list of uploaded images in the Photo group, which the earlier panel had, arrives with the image upload feature. [auto]
6. Only the owner can read or save the profile. A signed-out visitor and a signed-in account that is not the owner are refused on every request, including a request sent without the panel. No public page reads the profile. [human: intent §5, §3]
7. A refused or failed request changes nothing. A save refused because the sign-in has expired shows the same save message as any other failed save, and the next reload shows the sign-in screen. [auto]
8. The panel can reach the database only through the server, and the database's address and key never reach the browser. [human: intent §8]
9. Before the first save, or when the database is empty, the panel shows "No profile has been saved yet." with an empty form. The database starts empty, nothing from the earlier panel is imported, and the storage structure is created by the app on first use with nothing for the owner to run. [human: intent §8; auto]
10. A database that is paused after a week of no use, or unreachable for any other reason, shows "The profile could not be loaded." in the Profile screen only. Sign-in, the menu, the other screens' notices and the public site keep working. The owner restores a paused project in Supabase. No keep-awake job is added. [human: intent §4]
11. No message or log shows a database address, password, key or the database's own error text. [human: intent §5]
12. While a save is running the panel shows "Saving…" and disables the fields and "Save", so choosing "Save" twice sends one request. After a failed save the owner can choose "Save" again once the database is reachable. [auto]
13. Unsaved changes are lost on a reload or when another menu item is chosen. There is no warning, as in the earlier panel. [auto]
14. A fresh load always shows what is stored. A stored field that is missing or of the wrong kind shows as empty. There is no older shape to migrate. [auto]
15. The profile has no dates, so time zones do not apply. Losing the network after the page loaded fails the save with the save message and keeps what the owner typed. [auto]
16. There are no length limits beyond the earlier panel's, which had none. Long values wrap inside the form and nothing extends past a 375-pixel-wide phone screen. Every field has a visible label and messages are announced to screen readers. [auto]
17. The Profile screen uses the site's colour tokens in light and dark themes and keeps the earlier panel's layout. [human: intent §5]
18. The public landing page keeps showing the content that is in the repository. Reading the database from public pages is a non-goal. [human: intent §3]
19. Automated tests use a stand-in for the database and for sign-in, with a made-up owner email set only in the test run's environment. The owner checks one real saved edit on the SIT site (intent §7). [auto]
20. No secret value and not the owner's email appears in the repo, in a page's source, in a test file or in a log. Only setting names appear, and the pull request lists them. This feature adds only the settings intent §4 approves. [human: intent §4, §5]
21. This feature replaces the earlier Firebase profile store and its end-to-end spec, and amends the standing docs that say there is no database or describe Firebase admin modules and database rules. Other Firebase files stay until the feature that replaces each one. [auto]

## Out of Scope

- Choosing the profile photo from uploaded images, and uploading or deleting images. That arrives with the image upload feature.
- Editing experience, projects, certifications, tech stack or blog posts.
- Showing the saved profile on the public site.
- Importing anything the earlier panel saved.
- Edit history, undo, autosave and a warning about unsaved changes.
- A notice when another tab or device has saved a newer profile.

## Deferred

- Conflict detection between two tabs. One owner edits a few times a month, so the last save winning is enough.
- A keep-awake job for the free database. The owner accepted a pause (intent §4) and no job is approved.
- A separate message for a paused database. The one load message covers every unreachable case.
