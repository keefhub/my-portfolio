# Manage Image Library

```gherkin
Feature: Manage the library of uploaded images
  As the site owner
  I want to upload images in the panel, see them listed, copy their addresses and delete them
  So that I can use my own pictures on the portfolio without putting files in the code

  Scenario Outline: Owner uploads an allowed image and sees it listed
    Given the owner is signed in to the panel and saving is switched on
    And the image library is empty
    When the owner uploads <file>
    Then the owner should see "<file>" in the image library with a preview and its size
    And the owner should no longer see "No images uploaded yet"
    And after reloading the panel the image should still be listed

    Examples:
      | file                                  |
      | a 200 KB PNG named "headshot.png"     |
      | a 1 MB JPEG named "cover.jpg"         |
      | a 300 KB WebP named "badge.webp"      |
      | a 20 KB SVG named "logo.svg"          |
      | a PNG of exactly 5 MB named "big.png" |

  Scenario: Owner copies an uploaded image's address
    Given the image library lists "headshot.png"
    When the owner chooses "Copy address" for "headshot.png"
    Then the owner should see "Address copied"
    And the copied address should open the image when pasted into a browser signed out

  Scenario Outline: Owner is told why a file is refused and nothing is stored
    Given the owner is signed in to the panel and saving is switched on
    And the image library lists 2 images
    When the owner uploads <file>
    Then the owner should see "<message>"
    And the image library should still list 2 images
    And no new file should be stored

    Examples:
      | file                                    | message                                             |
      | a 5.1 MB PNG named "huge.png"           | That image is over 5 MB                             |
      | a PDF named "cv.pdf"                    | Only PNG, JPEG, WebP or SVG images can be uploaded  |
      | a GIF named "spin.gif"                  | Only PNG, JPEG, WebP or SVG images can be uploaded  |
      | an empty file named "blank.png"         | That file is empty                                  |

  Scenario Outline: Owner deletes an uploaded image only after confirming
    Given the image library lists "old-logo.png"
    When the owner chooses "Delete" for "old-logo.png"
    Then the owner should be asked to confirm, with a warning that records still using the image will show a broken image
    When the owner <choice>
    Then "old-logo.png" should <listing> in the image library
    And after reloading the panel "old-logo.png" should still <listing>
    And the image's address should <address>

    Examples:
      | choice          | listing            | address                 |
      | confirms        | no longer be listed | no longer open the image |
      | cancels         | still be listed    | still open the image    |

  Scenario: Owner manages the image library on a phone
    Given the owner is signed in to the panel and saving is switched on
    And the screen is 375 pixels wide
    And the image library lists an image with a very long file name
    When the owner uploads a 200 KB PNG named "headshot.png"
    Then "headshot.png" should be listed with its preview and size
    And the long file name should wrap within the screen
    And "Copy address" and "Delete" should be reachable for each image
    And the page should not scroll sideways

  Scenario Outline: The database refuses image list changes from anyone but the owner
    Given the image list holds an entry for an uploaded image
    And <who>
    When they try to <action> directly in the database, without using the panel
    Then the database should refuse the request
    And the image list should be unchanged
    And the panel should show them no image list

    Examples:
      | who                                                              | action                  |
      | nobody is signed in                                              | add an image entry      |
      | nobody is signed in                                              | remove the image entry  |
      | a different Google account is signed in                          | add an image entry      |
      | a different Google account is signed in                          | remove the image entry  |
      | the owner is signed in but the owner's account is not yet set up | add an image entry      |
      | the owner is signed in but the owner's account is not yet set up | remove the image entry  |

  Scenario Outline: File storage refuses changes from anyone but the owner
    Given file storage holds an uploaded image
    And <who>
    When they try to <action> directly in file storage, without using the panel
    Then file storage should refuse the request
    And the stored images should be unchanged

    Examples:
      | who                                                                 | action                        |
      | nobody is signed in                                                 | upload an image               |
      | nobody is signed in                                                 | delete the stored image       |
      | a different Google account is signed in                             | upload an image               |
      | a different Google account is signed in                             | delete the stored image       |
      | the owner is signed in but the owner's account is not yet set up    | upload an image               |
      | the owner is signed in but the owner's account is not yet set up    | delete the stored image       |

  Scenario Outline: File storage refuses oversized and non-image files even from the owner
    Given saving has been switched on for the owner's Google account
    And the owner is signed in
    When the owner tries to upload <file> directly to file storage, without using the panel
    Then file storage should refuse the request
    And nothing should be stored

    Examples:
      | file                       |
      | a 5.1 MB PNG               |
      | a PDF                      |
      | an HTML page               |
      | a GIF                      |
```

## Assumptions

1. The scenarios run against local stand-ins for sign-in, the database and file storage, never the live project or a real Google account; the owner's accepted upload in the first scenario goes through the stand-in storage, so it also shows storage accepts the owner (intent §4, §6). [human: intent §4]
2. The library is a new "Images" item in the panel menu, next to the six existing ones. The menu is otherwise unchanged. [auto]
3. Allowed types are PNG, JPEG, WebP and SVG, up to and including 5 MB, where 5 MB is 5 x 1024 x 1024 bytes. A file of exactly that size is accepted, and one byte more is refused (intent §2.4, §5). [human: intent §2.4]
4. The panel judges a file by the type the browser reports for it, and file storage judges it again by the type sent with the upload. The panel check is for the message; the storage check is the real boundary. An empty file is refused by both. [auto]
5. Uploaded images are stored exactly as given, with no resizing, cropping or conversion. They are kept under a generated, hard-to-guess file name; the owner's original file name is kept only for the list (intent §3). [human: intent §3]
6. SVG files are shown only as pictures in the panel's preview, never opened inline, so a script inside an SVG does not run. [auto]
7. Anyone may view an uploaded image by its address; only the owner may upload or delete (intent §2.4). The list of uploaded images itself is for the owner only: signed out, or signed in as anyone else, the panel shows no list. [human: intent §2.4]
8. The list shows each image's preview, original name and size, newest upload first. It shows all images on one scrolling list, with no paging, since one owner uploads a few images a month. [auto]
9. Uploading the same file twice stores two separate images with two addresses, both listed. Nothing is replaced and there is no duplicate warning. [auto]
10. An upload that fails part-way, for example because the network drops or saving is not switched on, shows an error, adds nothing to the list and keeps the owner on the screen. If the file reached storage but the list entry could not be saved, the stray file is removed; if that cleanup also fails, the owner sees the error and the stray file is harmless because only the owner could have created it. [auto]
11. Deleting an image removes both the file and its list entry. If the file is removed but the list entry cannot be, the entry stays listed and the owner can delete again. A delete that fails shows an error and leaves the image listed. [auto]
12. Deleting an image that a profile, certification, tech item or post still uses is allowed once confirmed. Those records are not changed and show a broken image, as a wrong repo path would; the confirmation text says so (decomposition decision 16). [auto]
13. Deleting is permanent: no trash, no undo (intent §2.4). [human: intent §2.4]
14. While saving is not yet switched on for the owner, the panel still shows the notice from `admin-owner-only-access`, and an upload attempt shows the failure message from assumption 10 rather than storing anything. [auto]
15. Choosing an uploaded image inside the profile, certification, tech stack and post editors is added by those slices. This story only provides the library and the address each image gets. A record refers to an uploaded image by that address, or to a file in the repo by a path starting with "/" (decomposition decision 15). [auto]
16. No file over 5 MB, no non-image file, and nothing from anyone but the owner ever reaches storage, whether through the panel or around it. Storage uses the same owner user ID placeholder as the database rules, filled in once by the owner (intent §4, §7). [human: intent §5]
17. Nothing here adds a server, a Cloud Function or any Firebase service beyond Authentication, Firestore and Storage, and no public page loads the Firebase library (intent §5). This is checked when the feature is built, not as a visible scenario. [human: intent §5]
18. The project's move to the pay-as-you-go plan, the budget alert and the creation of the storage bucket are done by the owner (intent §7), not by this feature. No secret or personal email is committed. [human: intent §7]

Edge-case sweep for the categories the scenarios do not cover:

19. Empty state: covered by the first scenario, which starts from an empty library and shows "No images uploaded yet". [auto]
20. Boundaries: covered by the exact 5 MB example and the 5.1 MB refusals. The longest file name is shown wrapped and never widens the page (see 27). There is no limit on how many images are stored. [auto]
21. Invalid input: covered by the refused-file scenarios. A file renamed to look like an image but with another type reported is refused by storage (last scenario). Uploading several files at once is not offered; the owner uploads one file at a time. [auto]
22. Duplicates: N/A as a scenario, because assumption 9 settles it: the same file twice gives two images. [auto]
23. State and lifecycle: N/A as a scenario, because an image is either listed or not. The effect of deleting an image that is still in use is settled by assumption 12. [auto]
24. Persistence failure: settled by assumptions 10 and 11, which keep the list and storage in agreement as far as possible and always show an error. A failed read of the list shows an error message, not "No images uploaded yet". [auto]
25. Navigation: the library has no form with unsaved input, so a reload loses nothing. Leaving the screen during an upload may cancel it; the owner then sees the image missing from the list and uploads again. Choosing Upload or Delete twice quickly acts once. [auto]
26. Offline and time: N/A for dates, since no date is shown. Offline, an upload or delete fails with the error from assumption 10 and the list stays as it was. [auto]
27. Presentation: the library works at 375 pixels wide with no sideways scrolling, with long file names and addresses wrapping, using the site's colour tokens in light and dark themes. Buttons are reachable by keyboard, the preview has the file name as its text description, and messages are plain text that does not rely on colour alone. [human: intent §5]
28. Multi-actor: there is one owner. Two tabs may both upload or delete; each action succeeds on its own and the other tab shows the change after a reload. Deleting an image already deleted in another tab shows an error and refreshes the list. [auto]

## Out of Scope

- Editing, resizing, cropping or converting an image
- Picking an uploaded image inside the profile, certification, tech stack or post editors
- Showing uploaded images on the public site, which is phase 2
- Folders, tags, search or renaming of uploaded images
- Uploading several files at once, or drag and drop
- Replacing an existing image while keeping its address
- Tracking which records use which image
- Other users, invited uploaders or permission levels
- Spending caps, usage dashboards or App Check

## Deferred

- Warning before a delete about which records still use the image, deferred because it needs reference tracking that a one-editor site does not need yet
- Paging or search of the library, deferred until it holds enough images to need it
- Retrying the clean-up of a stray file when the first clean-up attempt also fails, deferred because the file is harmless and only the owner could have created it
