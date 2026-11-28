# Intent: The public site shows the content managed in the admin panel

- **Slug:** `public-site-reads-database`
- **Owner:** Keith Lim (site owner)
- **Status:** ready

## 1. Goal

Everything visitors see on thegoldenpothos.xyz (the profile, experience, tech stack, projects,
certifications and blog posts) comes from the content the owner manages in the admin panel, not from
content written into the code. When the owner presses Publish in the panel, the change appears to
visitors within seconds, with no code change and no laptop needed. If the database is paused or
unreachable, visitors keep seeing the last published content and never an error.

## 2. Business context

### 2.1 The problem today

The admin panel already saves every section to the database, but the public site still shows content
hard-coded in the repo. Any visible change (a new job, a typo, a new post) means editing code,
committing and redeploying, which needs the owner's laptop and development set-up. Small updates
therefore get put off, and the panel, which was built to manage the site, does not do its job.

### 2.2 Why now, and what success looks like

The panel and the database are finished, and the owner has real content updates waiting to be made
through them. Success: in the month after this ships, every content change on the live site was made
only in the panel (zero code commits for content), and each appeared after pressing Publish.

### 2.3 Users and their situation

- The owner: the only person who edits and publishes, from any browser including a phone, whenever
  there is something to update (a few times a month).
- Visitors (hiring managers, recruiters, peers, search visitors): read the site and never sign in.
  They are affected by every publish and must never see an error, a draft or a half-built page.
- Two environments with separate content: SIT (sit.thegoldenpothos.xyz, deployed from `develop`) and
  live (thegoldenpothos.xyz, deployed from `master`). Each already reads only its own database.

### 2.4 Business rules

- Only the owner may publish; publishing on SIT changes only SIT, and on live only live.
- A saved change is not shown to visitors until the owner presses Publish, except that a code deploy
  also shows everything saved so far (accepted by the owner).
- A draft blog post is never public, whether published or not: not in the blog list, at its own
  address, in RSS or in the sitemap.
- A section with no saved content is hidden, together with its menu link; the rest of the page is
  unaffected.
- When a publish cannot reach the database, the panel says that the publish failed and why, and the
  site keeps showing the last published content.
- After this goal, content lives only in the database; the repo holds no copy of it.
- The owner re-enters today's content by hand, first on SIT, then on live before `develop` is merged
  into `master`.
- Blog post HTML stays trusted as today, because only the owner can write posts.

### 2.5 What happens when it goes wrong

The site is the owner's professional face. The worst outcomes: a recruiter opens the site during a
database pause and gets an error page or a blank section; a draft post becomes public; someone other
than the owner changes what the site shows or publishes; content that is on the live site today is
missing after the switch.

## 3. Non-goals

- A one-time import tool or script for today's content; the owner re-enters it by hand.
- Scheduled posts that go live at a future time.
- A keep-awake job or scheduled ping for the Supabase project.
- A full-site preview of unpublished changes (the existing post preview stays as it is).
- A publish history or rollback in the panel (Vercel's dashboard already offers rollback).
- A separate "published copy" of the content; a code deploy showing all saved content is accepted.
- Sanitising blog post HTML.
- Pages that read the database on every visit with no kept copy.
- A rebuild-based publish (deploy hook) or any new secret setting.
- Visitor accounts, comments, other editors, or any paid service.

## 4. Pre-approved decisions

| Kind | What is approved | Why it is needed, and what it changes | Alternatives ruled out, and why | Cost or risk accepted |
| --- | --- | --- | --- | --- |
| New dependency | None | | | |
| New environment variable | None. The existing seven settings are enough; each environment already points at its own database | | A deploy-hook setting for rebuild-on-publish: the owner wants pages to read the database, not rebuild | |
| External service or provider | None new. Uses Vercel's built-in keeping and refreshing of page copies (incremental regeneration) on the existing free plan | Lets pages read the database without a rebuild and keep the last good copy | | As I understand Vercel's free plan, it has usage allowances for this; a personal site stays far below them |
| Data store, sign-in or hosting change | Public pages (landing page, blog list, blog posts, RSS, sitemap) read their content from Supabase on the server and Vercel keeps the last good result; Publish in the panel, after the server's owner check, refreshes those copies. New blog posts appear at their own address without a code change | The owner wants edits in the panel to appear on the site with no rebuild, and the site must stay up during a database pause | Reading on every visit with no kept copy: the site would show errors during a pause or outage. Rebuilding on publish with a deploy hook: the owner rejected rebuilds | A code deploy also shows everything saved so far. If the database is down at a code deploy, that deploy may fail and the previous one stays live |
| Other choice the agent would otherwise guess | Replace the standing rules "public pages are prerendered at build time, no request-time rendering" (OVERVIEW §2 item 1, CLAUDE.md invariant 1) and "blog content lives in content/blog/*.md" (OVERVIEW §2 items 2 and 5) with: public pages read the database and keep the last good copy; content lives only in Supabase. Delete the repo's hard-coded section content and `content/blog/*.md` | The old rules are no longer true, and two copies of the content would drift | Keeping the repo copy as a fallback: the owner wants one source | The run rewrites `CLAUDE.md`, `Reference.md` and `OVERVIEW.md` and flags the change in the pull request |

## 5. Hard constraints

- A draft blog post never appears in the blog list, at its own address, in RSS or in the sitemap.
- When the database cannot be reached, every public page still shows its last published content, never an error page or an empty section that had content.
- Only the signed-in owner can publish; the server refuses a publish from a signed-out browser, from any other Google account, and from a request sent outside the panel.
- Saving in the panel does not change what visitors see until Publish is pressed (code deploys excepted, per §2.4).
- A section with no saved content is not shown, nor is its menu link.
- A failed publish leaves the public pages unchanged and the panel shows that it failed.
- No secret value, database address or owner email is sent to the browser, committed or logged.
- No database code is loaded in visitors' browsers.
- After this goal, the repo contains no hard-coded section content and no `content/blog/*.md` posts.
- SIT and live use different databases: SIT's pages and panel read and write only the SIT database, live's only the live database, and a publish on one never changes what the other shows.
- No new dependency, setting, external or paid service is added.
- The existing rules still hold: `trailingSlash` consistent in all three places, dates formatted in UTC, one site origin constant, images unoptimised, theme tokens only, the panel owner-only.

## 6. Definition of done

- [ ] On SIT, after changing a project in the panel and pressing Publish, the change is visible on the public page within a minute, with no code commit and no deployment.
- [ ] Before Publish is pressed, a saved change is not visible on the public page.
- [ ] A blog post published in the panel is listed on the blog page and readable at its own address, and appears in RSS and the sitemap, without a code change.
- [ ] A draft post saved in the panel is absent from the blog list, its own address returns not found, and it is absent from RSS and the sitemap.
- [ ] With every certification deleted and Publish pressed, the Certifications section and its menu link are gone and the rest of the page renders normally.
- [ ] With the database unreachable, every public page still shows its last published content, and pressing Publish shows a failure message in the panel.
- [ ] A publish attempt while signed out or signed in as another Google account is refused and changes nothing.
- [ ] Publishing a change on SIT leaves the live site unchanged.
- [ ] The repo holds no hard-coded profile, experience, tech stack, projects or certifications content and no posts in `content/blog/`.

## 7. Human-only items

- Re-enter today's content by hand in the SIT database, and check SIT against today's live site.
- Re-enter today's content in the live database and compare the live site section by section before merging `develop` into `master`; the pull request says not to merge to `master` until this is done.
- Restore the Supabase project in its dashboard if it pauses.
- Review and merge the pull request into `develop`, and later `develop` into `master`.

## 8. Notes for the agent (optional)

- The tables already exist and match the public components' fields (`src/lib/server/sql.ts`, `listSql.ts`, `postSql.ts`); reuse them and the existing server modules. Known gaps to settle the simple way: posts have no `updated` date in the database; the profile's social links carry a label and address while the hero shows an icon per link.
- Before deleting the repo content, the pull request should list today's content (or point at the commit that removes it) so the owner can re-enter it.
- Sized for one owner and a low-traffic personal site: no concurrency or scale work. Repeat presses of Publish are handled the simple way (for example the button is disabled while publishing).
