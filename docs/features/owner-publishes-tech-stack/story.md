# Owner Publishes Tech Stack

```gherkin
Feature: Owner publishes the tech stack
  As the site owner
  I want to publish my tech categories and their items from the admin panel
  So that the Tech Stack block on the landing page shows them without a code change

  Scenario: Owner publishes tech categories and visitors see them
    Given the owner has saved the categories "Frontend" with the items "React" and "Angular", and "Backend" with the item "Node.js"
    And each item has an icon
    When the owner presses "Publish"
    Then a visitor opening the landing page should see the Tech Stack block
    And the block should list "Frontend" then "Backend", in the order saved in the panel
    And each category should show its items with their names and icons, in the order saved

  Scenario: Item icon chosen from the image library shows to visitors
    Given the owner has saved a category whose item uses an image uploaded to the image library as its icon
    When the owner presses "Publish"
    Then a visitor should see that uploaded image as the item's icon

  Scenario: Saved tech stack changes stay hidden until Publish
    Given the Tech Stack block is published with the category "Frontend" and the item "React"
    And the owner has saved a new item "Vue" in "Frontend" and a new category "Cloud"
    When a visitor opens the landing page
    Then the visitor should still see "Frontend" with only "React"
    And the visitor should not see "Vue" or "Cloud"

  Scenario: Owner publishes a change to the tech stack and visitors see it within a minute
    Given the Tech Stack block is published with the category "Frontend" and the item "React"
    And the owner has saved the new item "Vue" in "Frontend"
    When the owner presses "Publish"
    Then a visitor reloading the landing page within a minute should see "Vue" in "Frontend"

  Scenario: Category with no items is not shown to visitors
    Given the owner has saved the category "Frontend" with the item "React"
    And the owner has saved the category "Tools" with no items
    When the owner presses "Publish"
    Then a visitor should see the category "Frontend"
    And the visitor should not see a category named "Tools"

  Scenario: Deleting every tech category and publishing hides the Tech Stack block
    Given the owner has deleted every tech category
    And the owner has saved at least one experience entry
    When the owner presses "Publish"
    Then a visitor should not see the Tech Stack block
    And the visitor should still see the Experience section
    And the menu should still show the "Experience" link
    And the rest of the page should render as before

  Scenario: Nothing saved for experience or tech stack hides the block and its menu link
    Given the owner has no saved experience entries and no saved tech categories
    When the owner presses "Publish"
    Then a visitor should not see the Experience section or the Tech Stack block
    And the menu should not show the "Experience" link
    And the other sections of the page should render as before
```

## Assumptions

1. The Publish button, its owner-only check, the failed-publish message and the kept copy come from `owner-publishes-profile` and are reused unchanged; this slice adds the Tech Stack block to what Publish refreshes. [auto]
2. The Tech Stack block shares its place on the page and its menu link with the Experience section, as decided in the decomposition; the "Experience" link shows when either has saved content. `owner-publishes-experience` has no spec yet, so its handling of that link is assumed. [auto]
3. Categories and the items inside them show in the order saved in the panel; the public page applies no sort of its own. [auto]
4. A category with no items is hidden from visitors, because it would show a heading with nothing under it. The panel still keeps it. [auto]
5. An item is shown with the name and icon saved; both are already required by the panel, so the public page needs no fallback for a missing one. [auto]
6. The categories and icons in the code are removed in this slice. Until the owner re-enters them in the panel and presses Publish, visitors see no Tech Stack block. The pull request names the commit that removes them. [human: intent §2.4]
7. Public pages do not sign anyone in, read cookies or load database code in the browser; the tech stack is read on the server. [human: intent §5]
8. A visitor sees a change after Publish within a minute and sees no saved change before Publish; a code deploy also shows everything saved so far. [human: intent §2.4]
9. SIT and live each show only their own saved tech stack. [human: intent §5]
10. Two tabs or a second signed-in device saving the same category: the last save wins, as in the panel today; this slice adds no conflict check. [auto]
11. Phone-width and keyboard behaviour of the Tech Stack block stay as they are today; this slice changes where the content comes from, not how it looks. [auto]
12. Edge-case sweep, each closed here with `N/A — <reason>`: [auto]
    - Boundaries & precision: N/A — the page shows every saved category and item as saved; this slice adds no limit, truncation or paging, and the panel's own length rules are unchanged.
    - Invalid & malformed input: N/A — names and icons are validated when saved in the panel (assumption 5); Publish only copies what is saved and takes no new input.
    - Duplicates & collisions: N/A — two categories with one name, or the same item twice in a category, are shown as saved; the panel's rules decide whether they can be saved, and this slice adds no de-duplication.
    - Navigation & interruption: N/A — leaving or closing the panel while "Publishing…" is shown is covered by `owner-publishes-profile`, whose Publish button is reused unchanged (assumption 1); a visitor leaving the page mid-load has no state to lose.
    - Offline & time: N/A — the one-minute freshness (assumption 8) is the only time rule; the block shows no dates or time-based content, and an owner who is offline cannot press Publish.
    - Persistence failure: N/A — a publish that cannot be stored keeps the last published copy and shows the failed-publish message from `owner-publishes-profile` (assumption 1); this slice adds no failure path of its own.

## Out of Scope

- Publish for the profile, experience, projects, certifications or blog posts; each has its own slice.
- Any change to how the panel's tech stack screen edits, orders or deletes categories and items.
- A per-section Publish button, a publish history, a rollback or a preview of unpublished tech stack changes.
- Importing today's categories and icons by script; the owner re-enters them by hand.
- Showing a visitor an error or a message when the database cannot be reached; `site-survives-database-outage` covers that.
- A new look for the Tech Stack block.

## Deferred

- Showing a category with no items as a labelled empty group: deferred until the owner wants it, since hiding is simpler and safer for visitors.
- A check that two tabs do not overwrite each other: deferred, because one owner edits a few times a month.
