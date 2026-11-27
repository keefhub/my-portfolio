# Retire Firebase And Document The New Stack

```gherkin
Feature: Retire Firebase and document the new stack
  As the site owner
  I want nothing of Firebase left in the repo or the pipeline, and the whole site checked once more
  So that I pay nothing, depend on no second system, and the public site still works exactly as before

  Scenario Outline: Visitor opens a public address after Firebase is removed
    Given Firebase has been removed from the site
    When a visitor opens "<address>"
    Then the visitor should see <result>
    And the content should be the same as before the migration

    Examples:
      | address                           | result                                         |
      | /                                 | the landing page                               |
      | /blog/                            | the list of published posts                    |
      | /blog/building-portfolio-nextjs/  | that post                                      |
      | /rss.xml                          | the feed, served as an RSS feed                |
      | /sitemap.xml                      | the sitemap                                    |
      | /robots.txt                       | the robots file                                |
      | /no-such-page/                    | the site's 404 page                            |

  Scenario: The panel address stays out of every public listing
    Given Firebase has been removed from the site
    When a visitor reads the sitemap, the robots file, the feed and the links on every public page
    Then none of them should mention "/bright-warm-greenhouse/"
    And the panel page should ask search engines not to index it

  Scenario: Public pages carry no sign-in or database code and let a visitor store nothing
    Given the site is built and running
    When a visitor opens each public page
    Then each page should arrive prebuilt, with no sign-in code and no database code
    And a request from the visitor to create, change or delete any content should be refused

  Scenario: A search of the repo finds no trace of Firebase
    Given the migration is complete
    When the repo's code, configuration, security rules, scripts, workflows, package files, tests and standing documents are searched for Firebase
    Then there should be no Firebase library, configuration, security rules, emulator set-up, deploy step or secret name
    And the earlier pipeline records and the public content that names Firebase should be the only matches

  Scenario: A search for secrets and the owner's email finds nothing
    Given the migration is complete
    When the repo, the built pages and the test files are searched for secret values and for the owner's email address
    Then no key, password or token value should be found
    And the owner's email address should not be found
    And only setting names should appear

  Scenario: The pull request pipeline passes without Firebase or a paid plan
    Given a pull request is opened into the development branch
    When the pipeline runs
    Then it should run the type check, the lint check and the build
    And no step should use a Firebase service-account secret
    And nothing in the repo or the pipeline should select or require a paid plan or a paid feature of Vercel, Supabase or Google

  Scenario: The owner reads the pull request and finds every setting to configure
    Given the pull request has been opened
    When the owner reads its description
    Then it should list every setting name the owner must set in Vercel, for Production and for the SIT deployment
    And it should list no value for any setting
```

## Assumptions

1. "A search of the repo" means code, configuration, security rules, scripts, workflows, package files, tests and the standing documents (the standing context, the architecture reference, the readme and the pipeline profile). Two kinds of file are left alone: the earlier pipeline records (the ten earlier story folders, the earlier admin panel requirement documents and the ten earlier rows of the implementation-order table), and public content (one blog post names Firebase Hosting, one project card is another app built on Firebase). Public content must not change, and deleting the records would erase the order-table history. [auto]
2. Each earlier slice deletes the Firebase code, specs and rules it replaced. This slice deletes what is left: the shared Firebase files, the emulator server setup, the rules and configuration files, the remaining admin specs, the rules-deploy scripts and the `firebase` and `firebase-tools` packages, and then runs the searches above over everything. [human: intent §4]
3. The pipeline loses both rules-deploy jobs and every use of the Firebase service-account secret. The verify job and the master-source job stay. The secrets and the `sit` and `production` GitHub environments stay in GitHub until the owner deletes them after the cutover. [human: intent §7]
4. The "same content as before" check compares each public address with the build made before the migration began. All public content comes from the repo and this feature changes none of it. [auto]
5. The public addresses are the five fixed ones plus each published blog post. An address nothing serves shows the site's own 404 page. [human: intent §5]
6. The secret scan looks for secret-shaped values and for any value given to the owner's email setting. It cannot know the owner's real email or secrets, so the test run uses a made-up email set only in the run's environment and a secret generated fresh for each run. [auto]
7. The setting names in the pull request are collected from the earlier slices' notes: the sign-in secret, the Google sign-in ID and secret, the owner email setting, and the Supabase database and storage settings. The pull request lists names only and says the owner sets every value separately for Production and for SIT. [human: intent §4]
8. The lint check is the pipeline's existing lint gate, so the known `ThemeProvider` lint error does not fail it. [auto]
9. Automated checks use stand-ins for Google and for Supabase. The owner's own check of one real sign-in and one saved edit on the SIT site covers the real services. [human: intent §7]
10. Edge-case sweep, empty and zero state: N/A — this feature shows no new data, and the empty database is owned by the editor slices.
11. Edge-case sweep, boundaries: N/A — there are no inputs or limits here, and the 5 MB image limit belongs to the image upload feature.
12. Edge-case sweep, invalid input: N/A — nobody types anything in this feature.
13. Edge-case sweep, duplicates: N/A — this feature creates nothing.
14. Edge-case sweep, state and lifecycle: the earlier records and public content that still name Firebase are the one stale-state case, settled in assumption 1. The hosting move is already done, so there is no old address to redirect.
15. Edge-case sweep, persistence failure: N/A — this feature stores nothing. Public pages never read the database, so a paused Supabase project leaves them working, which the third scenario checks by asking that they carry no database code.
16. Edge-case sweep, navigation: the 404 row of the first scenario covers a mistyped or removed address. There is no form or filter to interrupt.
17. Edge-case sweep, offline and time: N/A — no clock, date or offline behaviour changes.
18. Edge-case sweep, presentation and scale: N/A — nothing visible is added, and earlier slices already keep the panel on the site's colour tokens in light and dark themes.
19. Edge-case sweep, multi-actor and permissions: the third scenario checks that a visitor can store nothing, and the earlier slices own the owner-only checks on each editor. [human: intent §5]

## Out of Scope

- Deleting the Firebase projects or turning off their billing, deleting the Firebase service-account secrets, and removing the `sit` and `production` GitHub environments. These are the owner's steps after the cutover.
- Changing public content, including the blog post and the project card that name Firebase.
- Deleting or rewriting the earlier pipeline records.
- Creating the Supabase project or the Google sign-in app, setting any setting value in Vercel, and pointing DNS at Vercel.
- Importing old content. The new database starts empty.
- A job that keeps the free Supabase project awake.
- Public pages reading their content from the database.
- New screens, new fields or new behaviour in the panel.

## Deferred

- Deciding whether production and SIT share one Supabase project or use one each: the repo holds only setting names, so either works, and the owner chooses.
- Making a literal search for Firebase return nothing at all: deferred until the owner has read the pull request and decided whether to amend the earlier records or the public content.
- The check a month later that every provider's statement shows $0: it needs the owner and the providers' billing pages.
- Automated tests against real Google and real Supabase: deferred because they need real accounts and secret values that must never enter the repo.
