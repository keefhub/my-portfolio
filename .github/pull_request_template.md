## What changed

<!-- One or two sentences. Say what the code does now that it didn't before. -->

## Why

<!-- The problem or request behind it. Link the story or issue if there is one: docs/features/<slug>/story.md -->

## How to check it

<!-- Steps a reviewer can follow, or the command to run. Name the page, viewport and theme for anything visual. -->

## Settings to set in Vercel

Set each one in Vercel, once for Production and once for SIT. Names only: never write a value here.

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `ADMIN_EMAIL`
- `SUPABASE_DB_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Screenshots

<!-- UI changes only. Light and dark, desktop and mobile if the change affects them. Delete this section otherwise. -->

## Checks

- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] `npx playwright test e2e/<slug>.spec.ts` passes, or this change has no feature spec
- [ ] `npm run lint` shows no new errors (the `ThemeProvider.tsx:25` failure is already known)
- [ ] Manual checks I could not run are listed under Notes

## Notes

<!-- Anything a reviewer should know: tradeoffs, things left out, manual checks still pending, follow-ups. Write "None" if empty. -->
