# Separate SIT And Production

```gherkin
Feature: Separate SIT and production for the admin panel
  As the owner
  I want the admin panel to sign in and save on SIT and on production separately
  So that I can try changes on SIT without touching the live content

  Scenario Outline: The panel uses the project that matches the address it is opened on
    Given the owner opens the admin panel at "<address>"
    When the panel signs in, reads content, saves content or uploads an image
    Then every sign-in, database and file storage request is for the project "<project>"
    And no request is for the project "<other project>"

    Examples:
      | address                                       | project               | other project         |
      | thegoldenpothos.xyz                           | thegoldenpothos-5b3a1 | thegoldenpothos-sit   |
      | thegoldenpothos-5b3a1.web.app                 | thegoldenpothos-5b3a1 | thegoldenpothos-sit   |
      | thegoldenpothos-5b3a1.firebaseapp.com         | thegoldenpothos-5b3a1 | thegoldenpothos-sit   |
      | sit.thegoldenpothos.xyz                       | thegoldenpothos-sit   | thegoldenpothos-5b3a1 |
      | thegoldenpothos-sit.web.app                   | thegoldenpothos-sit   | thegoldenpothos-5b3a1 |
      | thegoldenpothos-sit.firebaseapp.com           | thegoldenpothos-sit   | thegoldenpothos-5b3a1 |
      | thegoldenpothos-5b3a1--preview-ab12cd.web.app | thegoldenpothos-sit   | thegoldenpothos-5b3a1 |
      | www.thegoldenpothos.xyz                       | thegoldenpothos-sit   | thegoldenpothos-5b3a1 |
      | thegoldenpothos.xyz.example.com               | thegoldenpothos-sit   | thegoldenpothos-5b3a1 |

  Scenario Outline: The panel opened on this machine talks only to the local stand-ins
    Given the owner opens the admin panel at "<address>"
    When the panel signs in, reads content, saves content or uploads an image
    Then every sign-in, database and file storage request goes to the local stand-ins
    And no request is for the project "thegoldenpothos-5b3a1"
    And no request is for the project "thegoldenpothos-sit"

    Examples:
      | address   |
      | localhost |
      | 127.0.0.1 |

  Scenario: The built panel carries real sign-in settings for both projects
    Given the site has been built
    When the sign-in settings inside the built admin panel are inspected
    Then none of them is a placeholder
    And the panel contains the app ID of the project "thegoldenpothos-5b3a1"
    And the panel contains the app ID of the project "thegoldenpothos-sit"

  Scenario Outline: Nobody can save while an environment's owner ID is not filled in
    Given the owner ID for "<environment>" has not been filled in
    And an account is signed in at "<address>"
    When the panel is shown
    Then the panel shows "Saving is not switched on yet."
    And an attempt to save, upload or delete is refused
    And the stored content stays as it was

    Examples:
      | environment | address                 |
      | production  | thegoldenpothos.xyz     |
      | SIT         | sit.thegoldenpothos.xyz |

  Scenario Outline: An account other than the owner is refused on each environment
    Given the owner ID for "<environment>" has been filled in
    And an account with a different user ID is signed in at "<address>"
    When the panel is shown
    Then the panel shows "This account is not allowed to use the admin panel."
    And an attempt by that account to save, upload or delete is refused
    And the stored content stays as it was

    Examples:
      | environment | address                 |
      | production  | thegoldenpothos.xyz     |
      | SIT         | sit.thegoldenpothos.xyz |

  Scenario: A push to develop deploys the site and the security rules to SIT only
    Given a change is pushed to "develop"
    When the pipeline runs
    Then the site is deployed to the project "thegoldenpothos-sit"
    And the database and file storage security rules are deployed to the project "thegoldenpothos-sit"
    And nothing is deployed to the project "thegoldenpothos-5b3a1"

  Scenario: A push to master deploys the site and the security rules to production only
    Given a change is pushed to "master"
    When the pipeline runs
    Then the site is deployed to the project "thegoldenpothos-5b3a1"
    And the database and file storage security rules are deployed to the project "thegoldenpothos-5b3a1"
    And nothing is deployed to the project "thegoldenpothos-sit"

  Scenario: Public pages are unchanged and load no Firebase code
    Given a visitor opens the home page, the blog list or a blog post
    When the page has loaded
    Then the page loads no sign-in, database or file storage code
    And the page content and look are the same as before this change

  Scenario: Nothing secret or environment-specific is added to the repository
    Given the repository after this change
    When its files and the pipeline are inspected
    Then each project's public web API key appears in the sign-in settings file only
    And the pipeline names no secret other than "GITHUB_TOKEN" and "FIREBASE_SERVICE_ACCOUNT"
    And no environment variable is added
    And the site is still a static export with no server
```

## Assumptions

1. The panel decides the project from the page address alone, using the host name without its port, so one build serves both environments. [human: intent §4]
2. An address matches a listed address only when it equals it in full. A host name that merely contains or starts with a listed address, such as `www.thegoldenpothos.xyz` or `thegoldenpothos.xyz.example.com`, counts as unlisted and so as SIT. [human: intent §2.4]
3. `thegoldenpothos.dev` is not one of the six listed addresses, so a panel opened there counts as SIT. The intent lists only the `.xyz` production addresses, and this story does not add to that list. [human: intent §2.4]
4. Hosting preview links are unlisted addresses and use SIT, even when the link name contains the production project ID. [human: intent §2.4]
5. `localhost` and `127.0.0.1` use the local stand-ins on any port. The stand-ins keep the project ID `thegoldenpothos-5b3a1` and the storage bucket `thegoldenpothos-5b3a1.firebasestorage.app`, so the existing stand-in tests stay as they are. [human: intent §8]
6. Both owner IDs ship as placeholders. Each ID is known only after the first real sign-in on that project, so until the owner fills it in the panel shows its existing saving-off notice and nobody can save there. [auto]
7. The two security rules files are deployed unchanged to both projects, and the owner check accepts the owner ID of either project. A sign-in from one project is never valid in the other, so the SIT owner cannot save to production. [human: intent §8]
8. Tests check the address-to-project choice on the built site with the local stand-ins and a recorded list of requests, and check the two deploy rules by reading the pipeline and package scripts. Google sign-in itself is not automated. [auto]
9. A failed rules deploy to SIT, such as a missing role on the SIT deploy account, fails the `develop` pipeline run. It never falls back to deploying to production. [auto]
10. Reloading the panel, or opening it on a different address, picks the project again from the address in use. Sign-in state is not shared between addresses. [auto]
11. SIT starts with no content. Every list editor on SIT shows the empty state it already has, and nothing is copied from production. [human: intent §3]
12. Saving on production works only after the owner moves the production database from Datastore mode to Native mode. Until then a production save shows the existing save-failure message. [human: intent §3]
13. The existing editors, the save and upload messages, and the sign-in window keep their current wording, apart from the sign-in settings that make sign-in work. [auto]

Edge-case categories, each closed explicitly: [auto]

14. Category 1 (empty and zero state): closed by Assumption 11 and Assumption 6. SIT starts empty and shows the existing empty states, and an unfilled owner ID shows the saving-off notice. [auto]
15. Category 2 (boundaries and precision): closed by Assumption 2 and the two address outlines. Only a full match counts as a listed address, and the rows with `www.` and a trailing host name test the edge. [auto]
16. Category 3 (invalid and malformed input): closed by Assumption 2 and Assumption 3. An address that is not listed, however odd, uses SIT and never production. The panel takes no typed input of its own here. [auto]
17. Category 4 (duplicates and collisions): N/A — the panel adds no records of its own, and one owner uses it. [auto]
18. Category 5 (state and lifecycle conflicts): closed by Assumption 9 and Assumption 12. A failed SIT rules deploy fails the run without touching production, and a production save before the database move shows the existing failure message. [auto]
19. Category 6 (persistence failure): closed by Assumption 9, Assumption 12 and the refused-save scenarios, where the stored content stays as it was. [auto]
20. Category 7 (navigation and interruption): closed by Assumption 10. Reloading, or opening the panel on another address, picks the project again from the address in use. [auto]
21. Category 8 (offline and time): N/A — no date is computed, and the panel already needs the network to sign in and save. [auto]
22. Category 9 (presentation and scale): N/A — no new screen or layout, and the wording is unchanged (Assumption 13). [auto]
23. Category 10 (multi-actor and permissions): closed by the owner-ID scenario outline for each environment, the other-account scenario outline, and Assumption 7. [auto]

## Out of Scope

- A tool to copy or sync content between SIT and production
- Changing the production database from Datastore mode to Native mode
- A visible label in the panel that says which environment it is on
- Any new screen, stored data, dependency or environment variable
- Restricting each web API key to its own addresses in the cloud console
- Automating a real Google sign-in

## Deferred

- Filling in the two owner IDs — deferred until the owner has signed in once on each environment and can read the user ID from the console
- Deleting the repo-level `FIREBASE_SERVICE_ACCOUNT` secret — deferred until this change reaches `master`
- Treating `thegoldenpothos.dev` as a production address — deferred until the owner asks to add it to the listed addresses
