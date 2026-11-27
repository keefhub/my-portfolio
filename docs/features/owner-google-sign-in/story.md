# Owner Signs In With Google

```gherkin
Feature: Owner signs in with Google
  As the site owner
  I want to sign in to my private panel with my own Google account
  So that only I can reach the panel's menu while the public site stays exactly as it was

  Scenario Outline: Owner signs in and sees the menu of seven screens
    Given the owner is signed out and opens "/bright-warm-greenhouse/" on <screen>
    When the owner chooses "Sign in with Google" and signs in with the owner's Google account
    Then the owner sees a menu with "Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts" and "Images", in that order
    And the owner sees a "Sign out" control
    And the owner does not see a "Sign in with Google" control
    And every menu item is entirely inside the width of the screen

    Examples:
      | screen                         |
      | a desktop screen               |
      | a 375-pixel-wide phone screen  |

  Scenario: A visitor who opens the panel address sees only the sign-in control
    Given a visitor is not signed in
    When the visitor opens "/bright-warm-greenhouse/"
    Then the visitor sees a "Sign in with Google" control
    And the visitor sees no menu, no "Sign out" control and no content

  Scenario Outline: A Google account that is not the owner is told it is not allowed
    Given a visitor is not signed in and sees the "Sign in with Google" control
    When the visitor signs in with <account>
    Then the visitor sees "This account is not allowed to use the admin panel."
    And the visitor sees a "Sign out" control
    And the visitor sees no menu and no content

    Examples:
      | account                                                                                  |
      | a Google account with a different email address than the owner's                         |
      | a Google account with the owner's email address that Google has not verified             |

  Scenario: Owner signs out, reloads and signs in again
    Given the owner is signed in and sees the menu
    When the owner chooses "Sign out" and reloads the page
    Then the owner sees the "Sign in with Google" control and no menu
    When the owner chooses "Sign in with Google" and signs in with the same Google account
    Then the owner sees the menu again

  Scenario: A sign-in that is not completed shows a message and can be tried again
    Given a visitor is not signed in and sees the "Sign in with Google" control
    When the visitor chooses "Sign in with Google" and leaves Google without choosing an account
    Then the visitor sees "Sign-in was not completed."
    And the "Sign in with Google" control is still shown and can be used
    And the visitor sees no menu and no content

  Scenario: The panel address is not advertised
    Given a visitor is not signed in
    When the visitor looks at the sitemap, the robots file, the feed, the landing page, the blog page and a blog post
    Then none of them lists or links to "/bright-warm-greenhouse/"
    And the panel page asks search engines not to index it

  Scenario Outline: Public addresses load as before
    Given a visitor is not signed in
    When the visitor opens <address>
    Then the visitor gets <result>

    Examples:
      | address            | result                                                 |
      | "/"                  | the landing page with the same content as before       |
      | "/blog/"             | the blog page with the same content as before          |
      | a blog post address, "/blog/" followed by its name    | that post with the same content as before              |
      | "/rss.xml"           | the same feed, served as an RSS feed                   |
      | "/sitemap.xml"       | the same sitemap                                       |
      | "/robots.txt"        | the same robots file                                   |
      | "/no-such-page/"     | the site's 404 page                                    |

  Scenario: Public pages carry no sign-in code, no setting value and no owner email
    Given a visitor is not signed in
    When the visitor views the source of the landing page and of a blog post
    Then the source contains no sign-in code
    And the source contains no secret value and no email address of the owner
```

## Assumptions

1. Only a Google account that Google reports as verified, and whose email address matches the owner's email setting, is allowed. Every other account is not allowed. There are no other users, invites or roles. [human: intent §2.4, §5]
2. The email comparison ignores upper and lower case and spaces around the setting's value. Google addresses do not differ by case, so this refuses nobody it should allow. [auto]
3. The owner check runs on every page load and request, not only at sign-in. If the owner changes the email setting, the old account is told it is not allowed on its next reload. [auto]
4. If the owner's email setting is missing or empty, every account is not allowed and the sign-in screen still works. The panel fails closed rather than open. [auto]
5. A not-allowed account stays signed in on the same screen, with the message and "Sign out", until it signs out. A reload keeps it there. The screen shows no detail of that account. This follows the earlier panel. [auto]
6. The panel keeps the earlier wording: heading "Admin", "Checking sign-in…" while the state is not yet known, then one of the three screens. Neither the sign-in control nor the menu shows before the state is known. [auto]
7. The owner stays signed in across reloads until choosing "Sign out" or until the sign-in expires. An expired sign-in shows the sign-in screen. [auto]
8. Choosing a menu item shows "<label> editor is not available yet." under the menu. No screen reads or writes data in this feature. Later features replace each notice. [auto]
9. Any failure to finish signing in (leaving Google, Google unreachable, blocked cookies, being offline, an address Google does not accept) shows "Sign-in was not completed." and keeps the control. No account detail is shown or logged. [auto]
10. Choosing "Sign in with Google" twice in a row starts one sign-in. [auto]
11. Signing out in one browser tab shows in another tab on its next reload. There is no live notice. [auto]
12. Sign-in works only on the production domain, the SIT domain and localhost, because Google accepts only fixed return addresses. On any other preview address the visitor sees "Sign-in was not completed." [human: intent §4]
13. Hosting is Vercel. The static-export ruling is lifted for sign-in and the panel only. The panel page and the sign-in routes are the only parts that run on the server in this feature, and every other page stays prebuilt. [human: intent §2.4, §4]
14. Sign-in reads and writes no database. A paused database does not affect it. [auto]
15. A visit to any public page or to the sign-in screen stores nothing about the visitor. [human: intent §2.3, §5]
16. Automated tests use a stand-in for Google, with sign-in cookies minted from a secret generated fresh for each run and a made-up owner email set only in the test run's environment. The owner checks one real Google sign-in on the SIT site (intent §7). [auto]
17. No secret value and not the owner's email appears in the repo, in a page's source, in a test file or in a log. Only setting names appear. The scenarios check the built pages. A search of the repo and test files is a task for the spec. [human: intent §5]
18. This feature does the edits the export lift makes necessary. It removes `outputDirectory` from the hosting settings and `output: "export"` from the build settings, and it keeps `trailingSlash: true` and unoptimized images. It replaces the Firebase sign-in code. It amends the standing docs it makes false: `OVERVIEW.md` §2 items 1, 4 and 5, `CLAUDE.md` Invariants 1, 2 and 6, the route table and the "never write or read a secret" rule, and `.claude/repo-profile.md`. The pull request flags the reworded secret rule. Other Firebase code stays until the feature that replaces it. [auto]
19. Nothing in the hosting settings selects or needs a paid Vercel plan or feature. [human: intent §5]
20. The panel uses the site's colour tokens in light and dark themes, and keeps the earlier panel's layout. [human: intent §5]

## Out of Scope

- Editing, saving or reading any content. Each screen's editor arrives with its own feature.
- Uploading or deleting images.
- Any user other than the owner, including invited editors, roles and visitor accounts.
- Password or email-link sign-in, and any account recovery. Google handles sign-in, 2-step verification and recovery.
- Showing the signed-in account's email or ID on the panel.
- Sign-in on preview addresses other than the SIT and production domains.
- Removing Firebase files other than the sign-in code. The later retire-firebase feature deletes what is left.

## Deferred

- A live notice in one tab when another tab signs out. A reload shows it, which is enough for one owner.
- A chosen session length. The sign-in library's default stands until the owner asks for another.
- Sign-in on every preview address. Google's fixed return addresses rule it out.
