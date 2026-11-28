# Owner Publishes Profile

```gherkin
Feature: Owner publishes profile
  As the site owner
  I want to save my profile in the panel and press Publish
  So that the hero, the About section, the footer and the menu show it to visitors within a minute, with no code change

  Scenario: Owner publishes a saved profile and visitors see it
    Given the owner is signed in and has saved a profile with Name "Keith Lim", Headline "Software Engineer", the About paragraphs "First paragraph." and "Second paragraph.", a social link with label "GitHub" and address "https://github.com/example", and Email "hello@example.com"
    When the owner chooses "Publish"
    Then the owner sees "Published. Visitors will see the profile within a minute."
    And within a minute a visitor who opens the landing page sees "Keith Lim" and "Software Engineer" in the hero
    And the visitor sees "First paragraph." and "Second paragraph." in the About section
    And the visitor sees a link to "https://github.com/example" and a link to the email address "hello@example.com"
    And the visitor sees "Keith Lim" in the footer
    And the menu shows "About"

  Scenario: A saved change stays hidden from visitors until the owner publishes
    Given the owner has published a profile with Headline "Software Engineer"
    And the owner has saved a change to Headline "Staff Engineer" and has not chosen "Publish"
    When a visitor opens the landing page
    Then the visitor sees "Software Engineer" and does not see "Staff Engineer"
    When the owner chooses "Publish"
    Then within a minute a visitor who opens the landing page sees "Staff Engineer"

  Scenario: A landing page with no saved profile hides the profile sections and the rest still shows
    Given no profile has ever been saved
    When a visitor opens the landing page
    Then the visitor sees no hero and no About section
    And the menu does not show "About"
    And the visitor sees no error message and no empty heading
    And the other sections of the page, the footer and the "Blog" link still show

  Scenario Outline: A request to publish from anyone but the owner is refused
    Given the owner has saved a profile with Name "Keith Lim" and has published it
    And the owner has since saved a change to Name "Keith L. Lim" without publishing
    When <requester> sends a request to publish <request>
    Then the request is refused
    And the response contains no profile content
    And a visitor who opens the landing page still sees "Keith Lim"

    Examples:
      | requester                                                          | request                  |
      | a visitor who is not signed in                                     | from the panel's address |
      | a visitor who is not signed in                                     | directly, without the panel |
      | a visitor signed in with a Google account that is not the owner's | from the panel's address |
      | a visitor signed in with a Google account that is not the owner's | directly, without the panel |

  Scenario: Publishing fails because the database cannot be reached and the site does not change
    Given the owner has published a profile with Name "Keith Lim"
    And the owner has saved a change to Name "Keith L. Lim"
    And the database cannot be reached
    When the owner chooses "Publish"
    Then the owner sees "The site could not be published because the database could not be reached. Try again later."
    And "Published." is not shown
    And the message shows no database address, password, key or error text
    And a visitor who opens the landing page still sees "Keith Lim"
    And the owner can choose "Publish" again

  Scenario: Choosing Publish twice in a row sends one publish
    Given the owner is signed in and has saved a profile
    When the owner chooses "Publish" and chooses it again before it has finished
    Then the owner sees "Publishing…" and "Publish" is disabled while it works
    And the owner then sees one "Published" message
    And "Publish" is available again

  Scenario: Publishing on one site does not change the other site
    Given the SIT site and the live site each show their own published profile
    And the SIT site shows Name "Keith Lim" and the live site shows Name "Keith Lim"
    When the owner saves Name "Keith Test" on the SIT site and chooses "Publish" there
    Then a visitor who opens the SIT landing page sees "Keith Test" within a minute
    And a visitor who opens the live landing page still sees "Keith Lim"
```

## Assumptions

1. This feature builds on the owner sign-in and the profile editor, which are built: the "Profile" screen, its "Save" and the owner-only check already exist. The profile editor and every section slice after this one keep their own specs; this story adds the Publish control, its owner-only request and the public reading of the profile. [auto]
2. There is one "Publish" button for the whole site, in the panel header, so it is available on every screen. This story makes it refresh the pages that show the profile. Later slices make the same button refresh their own sections. [auto]
3. Saving a profile does not change what visitors see. Visitors see the profile that was current when the owner last pressed "Publish". A code deploy also shows everything saved so far, which the owner accepts. [human: intent §2.4, §5]
4. The landing page reads the saved profile from the database on the server and Vercel keeps the last good copy of the page. The copy is renewed only by "Publish" or a code deploy, never on a timer and never when a visitor opens the page. The hero, the About section, the footer name, the social links, the email and the resume link all come from the profile. [human: intent §4]
5. Only the signed-in owner can publish. A signed-out visitor and a signed-in account that is not the owner are refused on every request, including a request sent outside the panel, and nothing changes. [human: intent §5]
6. A refused or failed publish leaves every public page as it was. The panel shows that the publish failed and why, with no database address, password, key or the database's own error text. [human: intent §2.4, §5]
7. When no profile has been saved, the hero, the About section and the "About" menu link are not shown, and the rest of the page renders. The hero holds the owner's name, so without a profile it is hidden too. A visitor never sees an empty heading or a placeholder. [auto; intent §2.4]
8. A social link shows an icon chosen from its address: "https://github.com/..." gives the GitHub icon, "https://linkedin.com/..." or "https://www.linkedin.com/..." the LinkedIn icon, an address starting with "mailto:" the mail icon, and any other address a generic link icon. The email field and the resume link keep their own icons. The link's label is its accessible name. [auto; intent §8]
9. A profile field left empty is not shown: no photo means no photo block, no email means no email link, no resume link means no resume button, no social links means no social row. About paragraphs and social links appear in the order the owner saved them. [auto]
10. The photo, About text and links are shown as saved. A very long name, headline or paragraph wraps inside its block and nothing extends past a 375-pixel-wide phone screen. [auto]
11. While a publish runs the panel shows "Publishing…" and disables "Publish", so repeat presses send one request. There is no queueing. After a failure the owner can press "Publish" again. [auto; intent §8]
12. If the database is unreachable when the owner opens a public page that already has a kept copy, the page still shows that copy. Proving that across every public page belongs to the outage slice; here it is only the Publish failure that is shown. [human: intent §5; auto]
13. A publish refreshes only the site that received it, and it never calls the other site. SIT and live each read only their own database, so a publish on one never changes the other. The test run has one stand-in database, so "Publishing on one site does not change the other site" is checked by hand on SIT and live and reported as pending, not passed. [human: intent §5; auto]
14. Visitors' browsers load no database code, address or key, and the page source holds no secret value or owner email. The public read does not look at who is visiting or at their cookies, so the page stays kept. [human: intent §5]
15. This feature removes the profile content written into the repo (the hero's name, headline and social links, the About text and the footer name) in its own commit, so the pull request names that commit and the owner can read the old text there to re-enter it. Until the owner re-enters and publishes it, those sections are hidden (Assumption 7). [human: intent §2.4, §5; auto]
16. This feature amends the standing rules it makes false: the prerender rule in the overview and in the project rules, and the routes table for the new publish address. The other standing rules are amended by the later slices that make them false. [human: intent §4]
17. The owner's profile has no dates, so time zones do not apply. Losing the network after the panel loaded fails the publish with the failure message. [auto]
18. The "Publish" control is reachable by keyboard, has a visible label and focus, its messages are announced to screen readers, and it uses the site's colour tokens in the light and dark themes. [auto; intent §5]
19. Automated tests use a stand-in for the database and for sign-in, with a made-up owner email set only in the test run's environment. The owner checks one real publish on the SIT site (intent §7). [auto]
20. No secret value and not the owner's email appears in the repo, in a page's source, in a test file or in a log, and this feature adds no dependency, setting or service. [human: intent §4, §5]
21. The publish request needs no Publish history or rollback. A mistaken publish is fixed by saving the right profile and pressing "Publish" again. [human: intent §3]
22. Invalid and malformed input: N/A — the "Publish" request carries no owner-typed data; it only refreshes the pages. Free-text fields (the social link addresses included) were validated when the owner saved them in the profile editor, and a social link address that matches no known site simply gets the generic link icon (Assumption 8), so nothing malformed reaches the public page as an error. Navigation and interruption: N/A — a publish that the owner leaves or closes the panel during still completes or fails on the server as one request and changes nothing partially; on return the owner presses "Publish" again, which is safe to repeat (Assumption 11), and a visitor leaving a page changes nothing. [auto]

## Out of Scope

- Publishing experience, tech stack, projects, certifications or blog posts, and showing them from the database. Each later slice does its own.
- Keeping the last published content when the database is down, across every public page. The outage slice proves that.
- A one-time import of today's content. The owner re-enters it by hand.
- A full-site preview of unpublished changes, a publish history, a rollback and scheduled publishing.
- A separate "published copy" of the content, a rebuild-based publish and any new setting.
- Several editors, visitor accounts and comments.

## Deferred

- A "Last published" time beside the button. The owner has no stated need and the intent lists no history.
- Per-section Publish buttons. The intent names one Publish; more buttons add states with no stated need.
- Real proof that a publish on SIT leaves live unchanged. The test run has one database, so the owner checks it by hand.
