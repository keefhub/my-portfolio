# Owner Uploads Images

```gherkin
Feature: Owner uploads images
  As the site owner
  I want to upload, list, copy the address of, pick and delete images in the private panel
  So that I can use my own pictures on my records without any other person being able to add or remove them

  Scenario Outline: Owner uploads an allowed image and sees it in the list
    Given the owner is signed in and has chosen "Images" in the menu
    When the owner chooses <file> in "Image file" and chooses "Upload"
    Then the list should show <name> with the size "<size>"
    And the list should still show <name> after the owner reloads the page

    Examples:
      | file                          | name           | size   |
      | a 300 KB PNG named "headshot.png" | "headshot.png" | 300 KB |
      | a 1.5 MB JPEG named "photo.jpg"   | "photo.jpg"    | 1.5 MB |
      | a 200 KB WebP named "banner.webp" | "banner.webp"  | 200 KB |
      | a 2 KB SVG named "logo.svg"       | "logo.svg"     | 2 KB   |
      | a PNG of exactly 5 MB named "large.png" | "large.png" | 5 MB |

  Scenario: A visitor who is not signed in opens an uploaded image, and its address carries no secret
    Given the owner has uploaded "headshot.png"
    And the owner has chosen "Copy address" for it and seen "Address copied"
    When a visitor who is not signed in opens that address
    Then the visitor should see the image
    And neither the address nor the page source of the "Images" screen should contain a sign-in or storage secret

  Scenario Outline: Owner chooses a file the panel refuses
    Given the owner is signed in and has chosen "Images" in the menu
    And the list shows only "headshot.png"
    When the owner chooses <file> and chooses "Upload"
    Then the owner should see "<message>"
    And the list should still show only "headshot.png"

    Examples:
      | file                          | message                                            |
      | a PNG of 5 MB plus 1 byte     | That image is over 5 MB                            |
      | a 6 MB PNG                    | That image is over 5 MB                            |
      | a PDF document                | Only PNG, JPEG, WebP or SVG images can be uploaded |
      | an empty PNG file             | That file is empty                                 |
      | no file                       | Choose an image first.                             |

  Scenario Outline: Uploads and deletes sent without the panel are refused
    Given the owner has uploaded "headshot.png"
    When <sender> sends <request> directly, without using the panel
    Then the request should be refused
    And the "Images" screen should still list only "headshot.png"

    Examples:
      | sender                                   | request                      |
      | a visitor who is not signed in           | an upload of a small PNG     |
      | a visitor who is not signed in           | a delete of "headshot.png"   |
      | a Google account that is not the owner's | an upload of a small PNG     |
      | a Google account that is not the owner's | a delete of "headshot.png"   |
      | the signed-in owner                      | an upload of a 6 MB PNG      |
      | the signed-in owner                      | an upload of a PDF document  |

  Scenario: Owner deletes an image after confirming
    Given the owner is on the "Images" screen and the list shows only "headshot.png"
    When the owner chooses "Delete" for "headshot.png"
    And the owner chooses "Confirm"
    Then the owner should see "No images uploaded yet"
    And a visitor who opens the former address of "headshot.png" should not see the image
    And the owner should still see "No images uploaded yet" after reloading the page

  Scenario: Owner chooses Delete but does not confirm
    Given the owner is on the "Images" screen and the list shows only "headshot.png"
    When the owner chooses "Delete" for "headshot.png"
    Then the owner should see 'Delete "headshot.png"? Records that still use this image will show a broken image.'
    And the owner should see "Confirm" and "Cancel"
    And a visitor who is not signed in should still be able to open the address of "headshot.png"
    When the owner chooses "Cancel"
    Then the list should still show "headshot.png" after the owner reloads the page

  Scenario: Owner picks an uploaded image as the profile photo
    Given the owner has uploaded "headshot.png"
    And the owner has chosen "Profile" in the menu
    When the owner chooses "headshot.png" under "Uploaded image"
    And the owner saves the profile
    Then the owner should see "Profile saved"
    And after the owner reloads the page, "Uploaded image" should show "headshot.png"
    And "Photo path" should be empty

  Scenario Outline: File storage cannot be reached
    Given the owner is signed in and file storage cannot be reached
    When the owner <action>
    Then the owner should see "<message>"
    And the owner should not see "No images uploaded yet"
    And the owner should still be able to use the menu and "Sign out"

    Examples:
      | action                              | message                           |
      | chooses "Images" in the menu        | The images could not be loaded.   |
      | uploads a 300 KB PNG                | The image could not be uploaded.  |
```

## Assumptions

1. Only the owner can upload or delete an image. Anyone can open an uploaded image by its address, signed in or not. [human: intent §2.4, §5]
2. The allowed types are PNG, JPEG, WebP and SVG, and the limit is 5 MB per file. [human: intent §2.4, §5]
3. The limit is inclusive: a file of exactly 5 MB is accepted and one of 5 MB plus 1 byte is refused. An empty file is refused. The type is the one the file declares, not the ending of its name. [auto]
4. The same limits are enforced for every request, not only by the panel. A request sent directly is refused by the same rules and changes nothing. A signed-out visitor and any Google account other than the owner's are refused for upload and delete. [human: intent §5]
5. The screen keeps the earlier wording and layout: heading "Images", the line "PNG, JPEG, WebP or SVG, up to 5 MB.", "Image file", "Upload", a list labelled "Uploaded images" with a preview, the file name, the size, "Copy address" and "Delete" for each image. The list is ordered newest first. [auto]
6. The refusal and failure messages keep their earlier wording, as written in the scenarios. "That image could not be deleted." appears when a confirmed delete fails, and the image stays listed. [auto]
7. Each upload creates a new entry with its own address. The address is not built from the file name, so uploading the same file twice gives two entries and a file with a name already used never replaces another. [auto]
8. Choosing "Upload" twice in a row starts one upload. While an upload or a delete is running, "Upload", "Delete", "Confirm" and "Cancel" are disabled. [auto]
9. An upload counts only when the file and its list entry are both saved. A failed or half-finished upload shows the failure message and is not listed. [auto]
10. A confirmed delete is permanent. There is no trash and no undo. [human: intent §2.4]
11. Deleting an image does not change the records that use it. They show a broken image until the owner picks another one, and the confirmation says so. The panel does not check which records use an image. [auto]
12. Deleting an image another tab has already deleted shows "That image was already deleted." and refreshes the list. Two tabs do not update each other. Each tab shows what was stored when it last loaded, and the last action wins. [auto]
13. "Uploaded image" under the profile's "Photo" is the choice this feature adds. The earlier "None" choice and the "Photo path" field stay. Choosing an uploaded image empties "Photo path", and typing a path sets "Uploaded image" back to "None". The profile feature has no spec yet, so this assumes its "Photo" group has a path field and nothing else. [auto]
14. A profile whose saved photo points to a deleted image opens with "Uploaded image" at "None" and the old address in "Photo path". [auto]
15. If the list of images cannot be loaded while the owner edits the profile, the profile shows "The uploaded images could not be loaded." and "Photo path" still works. [auto]
16. The image list comes from the database, and the files come from file storage. If either is paused or unreachable, the owner sees the failure messages above, never "No images uploaded yet". The menu, "Sign out", sign-in and every public page keep working. [human: intent §4]
17. Refreshing the page during an upload loses the chosen file. The upload may still finish, and the list after reload shows what was saved. [auto]
18. The list shows every image on one screen, with no paging. The owner uploads a few images at a time, and a long list is not a case this feature handles. [auto]
19. The 5 MB cap keeps storage inside the free plan. Nothing in this feature selects or needs a paid plan or paid feature of Supabase, Vercel or Google. No clean-up or keep-alive job is added. [human: intent §5, §8]
20. The panel shows an uploaded SVG only as a picture. A file name too long for its space wraps, and the page does not scroll sideways at phone width. Every control works by keyboard, and messages are announced to screen readers. [auto]
21. The screen uses the site's colour tokens in light and dark themes. [human: intent §5]
22. The storage key never reaches the browser. No secret value and not the owner's email appears in the repo, in a page's source, in a test file or in a log. [human: intent §5, §8]
23. Public pages keep showing what is in the repo. Picking a profile photo changes only what the panel stores. [human: intent §3]
24. Automated tests use a stand-in for file storage and for the database. The owner checks one real upload on the SIT site (intent §7). [auto]
25. This feature removes the earlier Firebase image upload, listing and delete code and its spec for the "Images" screen, and replaces them. Other Firebase code stays until the feature that replaces it. [auto]
26. The list shows no dates or times, so time zones do not apply. Going offline after the screen has loaded behaves like unreachable storage: the next upload or delete shows its failure message. [auto]

## Out of Scope

- Renaming, replacing, resizing, cropping, compressing or converting an uploaded image.
- Folders, tags, search, sorting choices, bulk upload and drag and drop.
- Showing which records use an image, or blocking a delete because one does.
- Picking an uploaded image on experience, projects, certifications, tech stack or blog posts. Each of those features adds its own picker.
- Showing uploaded images on public pages. Public pages keep reading from the repo.
- Restoring a deleted image.
- Upload progress bars.
- Other users, invited editors and visitor uploads.

## Deferred

- Checking that a file's real content matches its declared type. Only the owner can upload, so a mislabelled file is the owner's own.
- Removing stored files left behind by a half-finished upload. They are never listed, and the free allowance is far larger than the leftovers.
- Warning the owner when free storage is nearly used. The 5 MB cap and one owner keep use low, and a usage dashboard is exactly what the owner wants not to watch.
