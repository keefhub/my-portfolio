# Portfolio and blog

Keith Lim's portfolio and blog, at https://thegoldenpothos.xyz. It is built with Next.js (App Router), React, TypeScript, Tailwind CSS and Framer Motion. The public pages are prerendered. Sign-in with Auth.js and Google and the owner's admin panel run on the server, with the content stored in Supabase PostgreSQL and the uploaded images in Supabase Storage. The site is hosted on Vercel.

## Commands

- `npm run dev` starts the dev server.
- `npm run build` makes the production build.
- `npm run typecheck` checks the types.
- `npm run lint:new` runs the linter without the one known error.
- `npx playwright test e2e/<slug>.spec.ts` runs one feature's end-to-end spec against the built site (build first).

## Settings

The site reads seven settings by name. The owner sets each in Vercel for Production and for SIT; none is in the repository.

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `ADMIN_EMAIL`
- `SUPABASE_DB_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Branches

`develop` is served at the SIT address and `master` is production. A pull request always targets `develop`.

## More

See [CLAUDE.md](CLAUDE.md) for the rules and conventions and [Reference.md](Reference.md) for the architecture.
