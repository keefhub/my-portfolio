# Owner-Only Database Access

```gherkin
Feature: Only the owner can change content in the database
  As the site owner
  I want the content database to accept changes only from my own Google account
  So that nobody else can deface the portfolio, and I can tell when saving is not yet switched on

  Scenario: Owner's change is accepted once saving is switched on
    Given saving has been switched on for the owner's Google account
    And the owner is signed in to the panel
    When a change to a piece of content is sent to the database
    Then the database should accept the change
    And reading that content back should show the new value

  Scenario: Signed-out browser's change is refused
    Given nobody is signed in
    When a change to a piece of content is sent to the database
    Then the database should refuse the change
    And the content should keep its previous value

  Scenario: Another Google account's change is refused
    Given saving has been switched on for the owner's Google account
    And a different Google account is signed in
    When a change to a piece of content is sent to the database
    Then the database should refuse the change
    And the content should keep its previous value

  Scenario: Nobody can save before the owner's account is set up
    Given the owner's account has not yet been set up for saving
    And the owner is signed in to the panel
    When a change to a piece of content is sent to the database
    Then the database should refuse the change
    And the content should keep its previous value

  Scenario: Owner is told saving is not switched on and sees their user ID
    Given the owner's account has not yet been set up for saving
    When the owner signs in to the panel
    Then the owner should see "Saving is not switched on yet"
    And the owner should see their own user ID
    And the owner should see how to switch saving on

  Scenario: Signed-out visitor cannot read a draft blog post
    Given the database holds a blog post marked as a draft
    And nobody is signed in
    When the draft post is requested from the database
    Then the database should refuse the request
    And no part of the post should be returned

  Scenario: Another Google account cannot read a draft blog post
    Given the database holds a blog post marked as a draft
    And a different Google account is signed in
    When the draft post is requested from the database
    Then the database should refuse the request
    And no part of the post should be returned
```

## Assumptions

1. "Switched on" means the owner has put their own user ID in the access rules and deployed them; until then the rules hold a placeholder that matches no account (intent §4, §5). [human: intent §4]
2. The refusal wording "Saving is not switched on yet" is the panel's own message; the exact sentence may change in the spec, but it must say that saving is off and why. [auto]
3. The owner's user ID is shown to a signed-in account only as that account's own ID, never another account's (intent §8). [human: intent §8]
4. Whether the panel lets an account in at all, and how it words a refused account, belongs to `admin-sign-in`. This story adds only the saving-off notice for the owner and does not change what a refused account sees once saving is on. [auto]
4a. While saving is off, the owner is not locked out: intent §7 says the panel can read but not save, so the owner reaches the menu and sees the saving-off notice with their own user ID. With no owner ID set yet the panel cannot tell the owner from another account, so it treats the signed-in account as the owner for reading only, shows that account the notice and its own ID, and saves nothing for anyone. The "not allowed" screen applies to other accounts only after the owner's ID is filled in; `admin-sign-in` must word its assumption to match. [human: intent §7]
5. The owner can read a draft post; this story does not test that read, because the editor that lists drafts arrives with `manage-blog-posts`. [auto]
6. Published, non-draft content stays readable by anyone, so that phase 2 can read it for the public site (decomposition decision 5). A later slice may narrow this. [auto]
7. Refusals happen in the database itself, so a browser that skips the panel's screens is refused the same way. The scenarios exercise the database directly through local stand-ins for sign-in and the database, never the live project or a real Google account (intent §4, §6). [human: intent §4]
8. A refused change leaves the stored content untouched and shows no partial save; a change that fails while the owner is typing keeps what the owner typed in the form. The forms themselves arrive in later slices. [auto]
9. Only the owner's single account can write; there are no other roles, invites or groups (intent §2.4, §3). [human: intent §3]
10. Two tabs or two quick saves from the owner both go through; the last save wins, with no conflict warning (intent §8). [human: intent §8]
11. Nothing added by this story needs Firebase's pay-as-you-go plan: no file storage and no Cloud Functions (intent §5). This is checked when the feature is built, not as a visible scenario. [human: intent §5]
12. No secret, personal email or `.env` value is committed; the placeholder is a fixed text that matches nobody, and the owner's real ID is added by hand after the first sign-in (intent §4, §7). This is also checked at build time, not as a scenario. [human: intent §4]
13. The rules are kept in the repo and deployed with the live site. A deploy that fails because the deploy account lacks the needed role is expected until the owner grants it (intent §7). [human: intent §4]

Edge-case sweep for the categories the scenarios do not cover:

14. Empty state: N/A — the story stores no new content and lists nothing; a request for content that does not exist is simply refused or returns nothing, as before. [auto]
15. Boundaries: N/A — the story takes no sizes, counts or lengths; the only inputs are who is signed in and whether the owner's ID is set. [auto]
16. Invalid input: N/A — the owner types nothing in this story; an unrecognised or malformed sign-in is treated as nobody signed in, which scenario 2 already refuses. [auto]
17. Duplicates: N/A — nothing is created by this story; repeating the same accepted or refused change gives the same result each time. [auto]
18. Navigation: N/A — the saving-off notice is a plain screen with no form, so there are no unsaved edits to lose on leaving or reloading; a reload shows the notice again. [auto]
19. Offline and time: N/A — an offline change is refused by the database like any other failed save and keeps what the owner typed (assumption 8); no dates or time limits are involved, and a sign-in that expires counts as nobody signed in. [auto]
20. Presentation: the notice, the owner's user ID and the switch-on steps are plain text that wraps and stays readable at 375 pixels wide, with the ID selectable for copying; there are no other visual changes. [auto]

## Out of Scope

- The editing screens and forms for any content type — arrive in the `manage-` slices
- Showing the database content on the public site — phase 2
- Blocking a signed-in non-owner from seeing the panel's screens — handled by `admin-sign-in`
- Other users, invited editors or permission levels
- Uploading or storing image files
- Conflict detection between two simultaneous saves
- Rate limits, usage alerts or spending caps beyond the free plan
- Firebase App Check and session time-outs
- Audit history of who changed what

## Deferred

- Limiting public reads of published content to specific collections — deferred until phase 2 shows which ones the public site needs
- Automatic setting of the owner's user ID — deferred, the owner's first sign-in must happen first and the ID is added by hand
- Signing the owner out when the account is refused — deferred, the account stays signed in with a sign-out control (decomposition decision 11)
