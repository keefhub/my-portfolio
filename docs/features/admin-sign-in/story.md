# Admin Sign-In

```gherkin
Feature: Sign in to the private admin panel with Google
  As the site owner
  I want to open a private page, sign in with my Google account and see a menu of my content sections
  So that I can reach the content editors while nobody else can see or use them

  Scenario: Signed-out visitor opens the panel address
    Given nobody is signed in
    When the visitor opens "/bright-warm-greenhouse/"
    Then the visitor should see a "Sign in with Google" control
    And the visitor should not see any content from the portfolio or its database

  Scenario: Owner signs in and sees the section menu
    Given the owner is on the panel's sign-in screen
    And it does not matter whether the owner's user ID has been filled in yet
    When the owner signs in with their own Google account
    Then the owner should see a menu with "Profile", "Experience", "Projects", "Certifications", "Tech stack" and "Blog posts"
    And the owner should see a "Sign out" control

  Scenario: A different Google account is told it is not allowed
    Given the owner's user ID has been filled in
    And the panel's sign-in screen is showing
    When someone signs in with a Google account that is not the owner's
    Then they should see a message that this account is not allowed
    And they should see their own account's user ID
    And they should see a "Sign out" control
    And they should not see the section menu or any content from the database

  Scenario: Owner signs out
    Given the owner is signed in and viewing the section menu
    When the owner chooses "Sign out"
    Then the owner should see the "Sign in with Google" control again
    And the section menu should no longer be visible

  Scenario: Sign-in is cancelled before it finishes
    Given the owner is on the panel's sign-in screen
    When the owner closes the Google sign-in window without choosing an account
    Then the owner should see a message that sign-in was not completed
    And the owner should still see the "Sign in with Google" control
    And no section menu or database content should be visible

  Scenario: Owner uses the panel on a phone
    Given the owner is signed in on a screen 375 pixels wide
    When the owner views the section menu
    Then every menu item should be readable and reachable
    And the page should not scroll sideways

  Scenario: Panel is not advertised and public pages stay unchanged
    Given the site has been built
    When a search engine or a visitor requests the site's public pages and the panel's address
    Then the panel page should tell search engines not to index it
    And the panel's address should not appear in the sitemap or in the robots file
    And the home page and a blog post should show the same content as before
    And the home page and a blog post should not load the sign-in library
```

## Assumptions

1. Only the owner's Google account is allowed; whether an account is the owner's is decided by its Firebase user ID, never its email (intent §4, §8). [human: intent §4]
2. Until the owner's user ID is filled in, the panel cannot tell the owner from anyone else, so any signed-in account sees the section menu and its own user ID, and the panel can read but not save; the owner's user ID is how the owner learns what to enter (intent §7, §8). The "not allowed" message is for other accounts only, once the owner's user ID is filled in. The "saving is not switched on" notice itself belongs to `admin-owner-only-access`. [human: intent §7] The choice to show the menu to any signed-in account in that state is [auto], since reads are limited by the database to published content.
3. The "not allowed" account stays signed in until it chooses "Sign out"; it is not signed out automatically. [auto]
4. The signed-out and not-allowed screens show only the panel's own wording and no database content, even though the database may allow public reads of published content. [human: intent §5]
5. A signed-in owner who reloads the page stays signed in and lands on the section menu, using Google's own session handling. [auto]
6. The section menu items are visible but lead to editors delivered by later features; in this feature choosing one may show a placeholder. [auto]
7. A failed sign-in for any reason other than closing the window (for example no network) shows the same "sign-in was not completed" message and keeps the sign-in control. [auto]
8. The sign-in screen and the section menu use the site's existing colour tokens in both light and dark themes, and the sign-in screen also fits 375 pixels wide. [human: intent §5]
9. Automated checks use local stand-ins for Google sign-in, never the live Google service or live project (intent §4). [human: intent §4]
10. The Firebase web configuration is committed to the repo and is not treated as a secret (intent §4). [human: intent §4]
11. Edge-case sweep closes: empty state, boundaries and precision, duplicates and collisions, and offline and time are N/A, since the feature stores no data, takes no typed input, has no identifiers and shows no dates. State and lifecycle conflicts are N/A, since nothing is saved. Multi-actor: one owner; a second tab simply shows the same signed-in state. [auto]

## Out of Scope

- Any content editor, save, or delete (later features)
- Database rules and the owner user-ID placeholder (the next feature, `admin-owner-only-access`)
- Other users, invited editors, roles, or sign-in methods other than Google
- Session time-outs and App Check
- Any change to what visitors see on the public site
- Uploading images

## Deferred

- Showing the owner a "saving is not switched on yet" notice, deferred to `admin-owner-only-access`, which owns the rules
- A real Google sign-in check on the live site, deferred to the owner (intent §7), since automated checks use stand-ins
