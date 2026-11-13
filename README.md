# Daily

A quiet place for daily writing, gratitude and simple activity checklists. A separate React frontend for the [Homelab Management System](https://github.com/ChickenSplash/homelab-management-system), using the same shared sign-in as Chat and Music.

Production hostname: <https://daily.chickensplash.dpdns.org>.

Deployed on 13 November 2026. The production smoke check covered shared sign-in, journal autosave/reload, activity completion, export and account isolation; its temporary guest accounts were deleted. A consistent pre-deployment SQLite snapshot was copied off-host and restore-tested. Automatic database backup scheduling remains outstanding.

## Features

- Month calendar and selected-day panel on desktop, compact week strip on mobile.
- Multiple private journals, one Markdown-backed rich-text entry per journal per day.
- Autosave, local recovery drafts and revision conflicts instead of silent overwrites.
- Activities measured in repetitions, metres or seconds, or a simple checkbox.
- Daily totals, partial progress, completion, skip and undo on past, present or future dates.
- Weekly routines with effective dates and historical target snapshots.
- Journal management, activity archiving and confirmed deletion of archived activities, timezone settings, dark/light themes and export.
- A minimal calendar: centred date numbers and a single dot for today, without activity or journal badges.
- Shared 280 ms ease-out animations for day navigation, month navigation and collapsible journals/activities, with reduced-motion support.
- Previous-day content stays visible but cannot be edited while another day loads.
- Activity creation and management share a tabbed dialog. All dropdowns are themed, keyboard-accessible popovers that scroll independently of their modal.
- Compact journal headers include their prompt; journal management sits below them. Settings and logout live in the profile menu.
- Registered users and guests both supported. Guest data is temporary and cascades on account deletion.

## Stack

React, TypeScript, Vite, TanStack Query, Tiptap with Markdown storage, nginx. The Laravel API and all persistent data live in HMS, not in this repository.

## Local development

Clone the HMS repository alongside this one:

```text
Apps/
  homelab-management-system/   # Includes the Daily module
  daily-ui/
```

```sh
npm ci --ignore-scripts
docker compose -f dev/docker-compose.yml up -d --build
```

- App: <http://localhost:8092>
- Shared sign-in: <http://localhost:8093>
- Separate `daily-dev_database` Docker volume, never the production database.
- The guest sign-in tab is the easiest way to try the app without creating an account.
- No scheduler in the local stack. Read endpoints backfill elapsed targets; production also runs `daily:sync` hourly.

For hot reload, keep the local HMS container running and start:

```sh
VITE_ACCOUNTS_URL=http://localhost:8093 npm run dev
```

Use <http://localhost:5173>, not `127.0.0.1`, so cookies share the sign-in host. Set the local compose `DAILY_URL` to `http://localhost:5173` and recreate HMS first, since the sign-in return URL is allowlisted. Return it to `http://localhost:8092` for container-based tests.

## Checks

```sh
npm run build
npm run lint
npx playwright test
```

Playwright uses headless Chromium, Firefox and a Chromium phone viewport. Install its Chromium/Firefox browsers if needed. Tests run **only against the local stack**: they create temporary users and supply local-only rate-limit headers. Do not point them at production.

```sh
npx playwright install chromium firefox
```

## Privacy and recovery

- Every API query is scoped to its account. There are no shared journals or public activity feeds.
- Saved text lives in HMS. There is no analytics or third-party content loading.
- Raw Markdown HTML is treated as text; images and embedded media are not supported.
- Unsaved recovery drafts are kept in browser local storage in plain text, namespaced by user, journal, date and tab. Recovery works after reloading the same tab, not necessarily after closing it. Separate tab keys prevent one tab's save from clearing another tab's draft. They are removed when saved, discarded or on successful logout from Daily. Clear site data on shared devices, especially after logging out through another HMS app or closing a tab with unsaved changes.
- A revision mismatch pauses saving. Download the draft or explicitly load the server version to resolve it.
- Browser storage can be unavailable or full. Do not rely on it as a backup: keep the page open until it says Saved or download your draft.
- Data is not end-to-end encrypted. The server operator and database backups can access it.
- Settings export JSON containing Markdown entries, all schedules and daily results. Individual entries can also be downloaded as `.md` files.

## Production deployment (not automatic)

1. Review and deploy the matching HMS Daily module. Back up its SQLite database before migrations.
2. Deploy this repository with `docker compose up -d --build` on the existing `edge` network.
3. Point the tunnel hostname `daily.chickensplash.dpdns.org` at `http://daily-ui:80`.
4. Set HMS `DAILY_URL=https://daily.chickensplash.dpdns.org` and add `daily.chickensplash.dpdns.org` to `SANCTUM_STATEFUL_DOMAINS`, retaining the Chat and Music hosts. No Reverb configuration is needed.
5. Verify sign-in, ownership isolation, exports and scheduled `daily:sync`.
6. Confirm automated SQLite backups and an off-host restore test before using it for important writing. Filesystem copies of a live WAL database are not sufficient; use SQLite's backup API or `VACUUM INTO`.

The production compose file publishes no host ports. Never commit `.env`, database files, exports or personal journal data.
