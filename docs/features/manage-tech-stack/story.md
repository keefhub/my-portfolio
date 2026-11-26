# Manage Tech Stack

```gherkin
Feature: Manage tech stack categories and their items
  As the site owner
  I want to add, edit, reorder and delete tech stack categories and the items in them from the panel
  So that I can keep my skills list current without touching code

  Scenario: Owner adds a category with items and finds it after a reload
    Given the owner is signed in and has opened "Tech stack"
    And no tech categories exist yet
    And the image library holds an uploaded image named "firebase-logo.png"
    And the owner sees "No tech categories yet" and an "Add category" control
    When the owner adds a category named "Cloud" with the items "Firebase" with the uploaded image "firebase-logo.png" as its icon and "Docker" with icon path "/icons/docker.png" and chooses "Save"
    And the owner reloads the page and opens "Tech stack"
    Then the owner should see the category "Cloud" listing "Firebase" then "Docker"
    And "Firebase" should still show the image "firebase-logo.png" as its icon
    And "Docker" should show the icon path "/icons/docker.png"
    And the owner should no longer see "No tech categories yet"

  Scenario: Owner edits a category name and its items
    Given the category "Cloud" has the items "Firebase" and "Docker"
    When the owner renames the category to "Cloud and DevOps", changes the icon path of "Docker" to "/icons/docker-new.png", adds the item "GitHub Actions" with icon path "/icons/actions.png" and chooses "Save"
    And the owner reloads the page and opens "Tech stack"
    Then the owner should see the category "Cloud and DevOps" listing "Firebase", "Docker" with icon path "/icons/docker-new.png", and "GitHub Actions"

  Scenario: Owner changes the order of categories and of items
    Given the categories "Frontend", "Backend" and "Cloud" are listed in that order
    And the category "Frontend" lists the items "React" then "Angular"
    When the owner chooses "Move down" on the category "Frontend"
    And the owner chooses "Move up" on the item "Angular" in "Frontend"
    And the owner chooses "Save"
    And the owner reloads the page and opens "Tech stack"
    Then the owner should see the categories in the order "Backend", "Frontend", "Cloud"
    And the category "Frontend" should list "Angular" then "React"

  Scenario Outline: Owner is asked to confirm before a category or item is deleted
    Given the category "Backend" lists the items "Node.js" and "ASP.NET Core"
    When the owner chooses "Delete" on the <target>
    Then the owner should be asked to confirm the delete of the <target>
    When the owner answers "<answer>"
    And the owner reloads the page and opens "Tech stack"
    Then the <target> should <outcome>

    Examples:
      | target                  | answer  | outcome                  |
      | category "Backend"      | Delete  | no longer be listed      |
      | category "Backend"      | Cancel  | still be listed          |
      | item "Node.js"          | Delete  | no longer be listed      |
      | item "Node.js"          | Cancel  | still be listed          |

  Scenario Outline: Owner saves a category with a missing or invalid value
    Given the owner is adding a category named "<category>" with the item "<item>" and icon path "<icon>"
    When the owner chooses "Save"
    Then the owner should see "<message>" next to the field at fault
    And nothing should be saved
    And everything the owner typed should still be on the screen

    Examples:
      | category | item  | icon                              | message                                  |
      |          | React | /icons/react.png                  | Category name is required                |
      | Frontend |       | /icons/react.png                  | Item name is required                    |
      | Frontend | React |                                   | Icon is required                         |
      | Frontend | React | https://example.com/react.png     | Icon path must start with "/"            |

  Scenario: Owner's save is not accepted by the database
    Given the owner has changed the category "Cloud" to "Cloud and DevOps"
    And the database is not accepting saves from the panel
    When the owner chooses "Save"
    Then the owner should see a message that the change was not saved
    And the category should still show "Cloud and DevOps" with everything else the owner typed
    And after a reload the owner should see the category named "Cloud"

  Scenario: Owner manages the tech stack on a phone
    Given the owner has opened "Tech stack" on a screen 375 pixels wide
    And a category lists an item named "Microsoft Azure DevOps Services with Boards and Pipelines"
    When the owner scrolls through the list and opens the form to edit that category
    Then every control should be reachable without sideways scrolling
    And the long item name should wrap inside the screen
```

## Assumptions

1. The panel offers the same controls and wording as the experience editor, which this feature depends on: "Add category", "Save", "Cancel", "Delete", "Move up" and "Move down". No `spec.md` for `manage-experience` exists yet, so this is unverified. [auto]
2. A category is one record holding its name and an ordered list of items. Each item has a name and an icon path. Saving a category saves its items with it. [auto]
3. Today's site shows each category with its items; the panel reads the stored order for both and does not sort alphabetically. [auto]
4. An item's icon is either an uploaded image chosen from the image library (`manage-image-library`) or a repo path typed as text, like the paths the site uses today (`/icons/react.png`). Choosing an uploaded image stores that image's public address, so it still shows after a reload. A typed path must start with "/" and is not a web address; the panel does not check that the file exists. If an uploaded image is deleted from the library later, the item keeps the stale address and the icon fails to load, as a wrong path would. [human: intent §2.4, §8]
5. Category name, item name and icon path are all required. Names are trimmed of leading and trailing spaces; a value of only spaces counts as blank. [auto]
6. Names may be up to 80 characters; longer text is refused with a message that says so. A category may hold any number of items. [auto]
7. Two categories, or two items in one category, may share a name. They are separate records. [auto]
8. Moving a category or an item up or down is saved when the owner chooses "Save" on the list or form, like other edits. The first item cannot move up and the last cannot move down; those controls are disabled. Reordering uses the move controls, not drag and drop. [auto]
9. Choosing "Delete" on a category asks for confirmation naming the category and the number of items it holds, and a confirmed delete removes the category and all its items for good. Removing a single item asks for confirmation too, and a confirmed removal is saved at once. There is no undo (intent §2.4). [human: intent §2.4]
10. A new category goes to the end of the list. [auto]
11. Pressing "Save" disables it until the save finishes, so a double click creates one record. [auto]
12. A save the database refuses, or that fails on the network, shows a message that the change was not saved. The form keeps what the owner typed and the stored value is unchanged. This covers the state before the owner's user ID is filled in. [human: intent §5]
13. If the list cannot be loaded, the panel shows an error message and no list. It does not show "No tech categories yet", which means the database was read and was empty. [auto]
14. Unsaved input is lost on a reload or when the owner leaves "Tech stack". The panel does not warn about this. [auto]
15. Opening "Tech stack" while signed out or as a non-owner shows no category, because the panel shows no database content to them (covered by `admin-sign-in`); this feature adds no separate scenario for it. [human: intent §5]
16. One owner, last save wins, with no conflict detection between two tabs (intent §8). [human: intent §8]
17. The editor uses the site's colour tokens in the light and dark themes. The public site's tech stack section is not changed and still shows what is in the code. [human: intent §3, §5]
18. This feature depends on `manage-experience` for the list editor and the confirmation, and on `admin-owner-only-access` for who may save, and on `manage-image-library` for the uploaded images an icon can be chosen from. No `spec.md` exists for it yet, so how the picker is worded is unverified. [auto]
19. Offline and time: the story has no dates, times or time zones, so time is N/A. If the network drops, a save fails as in assumption 12 and a list that cannot load shows the error of assumption 13. State and lifecycle: a category has no status or stages, only present or deleted, so there is nothing further to cover; a list left open in a stale tab is not refreshed, and the owner reloads to see the stored list (last save wins, assumption 16). [auto]

## Out of Scope

- Showing the saved tech stack on the public site (phase 2).
- Uploading images from this editor (the image library does that) and checking that a typed icon path points to a file that exists.
- Dragging to reorder.
- Moving an item from one category to another; the owner removes it and adds it again.
- Bulk edits, import of today's tech stack, search or filtering of the list.
- A trash, undo or version history for deleted categories or items.
- Warning about unsaved changes, and conflict detection between two tabs or devices.

## Deferred

- Moving an item between categories: deferred until the owner asks for it; removing and re-adding covers it for now.
- A check that a typed icon path points to an existing file: deferred, because the panel cannot see the repo's files.
