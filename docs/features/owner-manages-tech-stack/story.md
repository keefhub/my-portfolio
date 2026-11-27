# Owner Manages Tech Stack

```gherkin
Feature: Owner manages tech stack categories and their items
  As the site owner
  I want to add, edit, reorder and delete tech stack categories and the items in them from the panel
  So that I can keep my skills list current without touching code

  Scenario: Owner adds a category with items and finds it after a reload
    Given the owner is signed in and has opened "Tech stack"
    And no tech categories exist yet
    And the image library holds an uploaded image named "postgres-logo.png"
    And the owner sees "No tech categories yet." and an "Add category" control
    When the owner adds a category named "Data" with the items "PostgreSQL" with the uploaded image "postgres-logo.png" as its icon and "Redis" with icon path "/icons/redis.png" and chooses "Save"
    And the owner reloads the page and opens "Tech stack"
    Then the owner should see the category "Data" listing "PostgreSQL" then "Redis"
    And "PostgreSQL" should still show the image "postgres-logo.png" as its icon
    And "Redis" should show the icon path "/icons/redis.png"
    And the uploaded image "postgres-logo.png" should open for a signed-out visitor at its address
    And the owner should no longer see "No tech categories yet."

  Scenario: Owner edits a category name and its items
    Given the category "Cloud" has the items "Vercel" and "Docker"
    When the owner renames the category to "Cloud and DevOps", changes the icon path of "Docker" to "/icons/docker-new.png", adds the item "GitHub Actions" with icon path "/icons/actions.png" and chooses "Save"
    And the owner reloads the page and opens "Tech stack"
    Then the owner should see the category "Cloud and DevOps" listing "Vercel", "Docker" with icon path "/icons/docker-new.png", and "GitHub Actions"

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
      | category "Backend"      | Confirm | no longer be listed      |
      | category "Backend"      | Cancel  | still be listed          |
      | item "Node.js"          | Confirm | no longer be listed      |
      | item "Node.js"          | Cancel  | still be listed          |

  Scenario Outline: Owner saves a category with a missing or invalid value
    Given the owner is adding a category with the name <category>, the item name <item> and the icon <icon>
    When the owner chooses "Save"
    Then the owner should see "<message>" next to the field at fault
    And nothing should be saved
    And everything the owner typed should still be on the screen

    Examples:
      | category                | item                    | icon                              | message                                       |
      | blank                   | "React"                 | "/icons/react.png"                | Category name is required                     |
      | a name of 81 letters    | "React"                 | "/icons/react.png"                | Category name must be 80 characters or fewer  |
      | "Frontend"              | blank                   | "/icons/react.png"                | Item name is required                         |
      | "Frontend"              | a name of 81 letters    | "/icons/react.png"                | Item name must be 80 characters or fewer      |
      | "Frontend"              | "React"                 | blank                             | Icon is required                              |
      | "Frontend"              | "React"                 | "https://example.com/react.png"   | Icon path must start with "/"                 |

  Scenario Outline: A direct request from anyone but the owner cannot change the tech stack
    Given the category "Frontend" is stored with the items "React" and "Angular"
    And <sender> sends a request to <change> without using the panel
    Then the request should be refused
    And the owner, signed in and opening "Tech stack", should still see the category "Frontend" listing "React" then "Angular" and no other category

    Examples:
      | sender                                                           | change                                        |
      | a signed-out visitor                                             | add the category "Spam"                       |
      | a signed-out visitor                                             | rename the category "Frontend" to "Hacked"    |
      | a signed-out visitor                                             | delete the category "Frontend"                |
      | someone signed in with a Google account that is not the owner's  | add the category "Spam"                       |
      | someone signed in with a Google account that is not the owner's  | rename the category "Frontend" to "Hacked"    |
      | someone signed in with a Google account that is not the owner's  | delete the category "Frontend"                |

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

1. The "Tech stack" screen behaves like the experience editor, which this feature depends on for the list pattern: the controls "Add category", "Save", "Cancel", "Delete", "Move up" and "Move down", and a confirmation step for each delete. No `spec.md` exists for `owner-manages-experience` yet, so the exact wording is unverified. [auto]
2. A category is one record holding its name and an ordered list of items, and each item has a name and an icon. Saving a category saves its items with it. [auto]
3. An item's icon is either an uploaded image chosen from the image library or a path to a file in the site, typed as text, such as "/icons/redis.png". Choosing an uploaded image keeps that image's public address, so the icon still shows after a reload and opens for a signed-out visitor. A typed path must start with "/" and must not be a web address; the panel does not check that the file exists. If the owner later deletes an uploaded image, an item that used it keeps the old address and its icon fails to load, as a wrong path would. [human: intent §2.4]
4. The image library and its picker come from `owner-uploads-images`, which this feature depends on. No `spec.md` exists for it yet, so how the picker is worded is unverified. [auto]
5. Category name, item name and icon are all required. Names are trimmed of leading and trailing spaces, and a value of only spaces counts as blank. [auto]
6. Names may be up to 80 characters; longer text is refused with a message that says so. A category may hold any number of items. [auto]
7. Two categories, or two items in one category, may share a name. They are separate records. [auto]
8. Moving a category up or down is stored when the owner chooses "Save" on the list, and moving an item is stored when the owner chooses "Save" on the category's form. The first entry cannot move up and the last cannot move down, so those controls are disabled. Reordering uses the move controls, not drag and drop. The panel reads the stored order and does not sort by name. [auto]
9. Choosing "Delete" on a category asks for confirmation that names the category and the number of items in it. A confirmed delete removes the category and all its items for good. Choosing "Delete" on one item of a saved category asks for confirmation too, and a confirmed removal is stored at once. There is no undo, and nothing is deleted until the owner confirms. [human: intent §2.4, §5]
10. A new category goes to the end of the list. [auto]
11. "Save" is disabled until the save finishes, so a double click stores one record. [auto]
12. Only the owner's Google account may read, add, change, reorder or delete tech categories. The server refuses a signed-out visitor and any other Google account, whether the request comes from the panel or is sent directly, and the refusal changes nothing that is stored. The panel shows no category to a signed-out visitor or another account (covered by `owner-google-sign-in`), so that case has no panel scenario here. [human: intent §5]
13. A save the database refuses, or that fails on the network, shows a message that the change was not saved. The form keeps what the owner typed and the stored value is unchanged. This includes a free database that has paused for lack of use: the owner restores it in Supabase, and the public site and sign-in keep working meanwhile. [human: intent §4, §5]
14. If the list cannot be loaded, the panel shows an error message and no list. It does not show "No tech categories yet.", which means the database was read and was empty. [auto]
15. The new database starts empty and the owner retypes any content, so there is no import of existing tech stack data (intent §8). [human: intent §8]
16. Unsaved input is lost on a reload or when the owner leaves "Tech stack". The panel does not warn about this. A double click on a primary action is covered by assumption 11. [auto]
17. This story has no dates, times or time zones, so time is not a dimension of it. If the network drops, a save fails as in assumption 13 and a list that cannot load shows the error of assumption 14. [auto]
18. One owner and one editor: the last save wins, with no conflict detection between two tabs. A list left open in a stale tab is not refreshed, and the owner reloads to see what is stored. [human: intent §8]
19. The editor uses the site's colour tokens in the light and dark themes. The public site's tech stack section is not changed and still shows what is in the repo. [human: intent §3, §5]
20. The panel's server-side checks, the signed-in owner and the "not allowed" screen are provided by `owner-google-sign-in`, and the first use of the database by `owner-edits-profile`. Both are earlier slices with no `spec.md` yet. [auto]

## Out of Scope

- Showing the saved tech stack on the public site; public pages keep showing what is in the repo (intent §3).
- Uploading images from this editor (the image library does that) and checking that a typed icon path points to a file that exists.
- Dragging to reorder.
- Moving an item from one category to another; the owner removes it and adds it again.
- Bulk edits, import of today's tech stack, and search or filtering of the list.
- A trash, undo or version history for deleted categories or items.
- Warning about unsaved changes, and conflict detection between two tabs or devices.
- Other users, invited editors or permission levels (intent §3).

## Deferred

- Moving an item between categories: deferred until the owner asks for it, since removing and re-adding covers it for now.
- A check that a typed icon path points to an existing file: deferred, because the panel cannot see the repo's files.
