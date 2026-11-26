# LineCheck — LCRI operator console

A console for contract water operators who run many small community water systems. It tracks readiness for the federal Lead and Copper Rule Improvements (LCRI) compliance date of **1 Nov 2027** across a whole portfolio.

| Route | What it does |
| --- | --- |
| `/` | Portfolio: every system with readiness, material mix, unknown share, year-1 replacement target, plan and notice status. Add systems, load or remove example data. |
| `/systems/$id` | One system: inventory totals, readiness checklist, replacement pace, service lines with field verification of unknown lines. |
| `/notices` | Pick systems, preview the annual notice letter, queue a batch for print and mail. |
| `/reports` | Systems grouped by state, with a CSV of inventory totals to copy or download. |
| `/field` | Field work. *Mine*: a phone-first list of the lines assigned to me; record material, method, notes and a photo. *Everyone*: open work per person and the latest results. |
| `/team` | Create a team or join one with an invite code; the owner sees the code, renames the team and removes members. |

All pages sit under `src/routes/_authed/` (sign-in required). Page components are in `src/components/lcri/`, styles in `src/lcri.css` (scoped under `.lcri-app`).

### Data (`base44/entities`)

- `WaterSystem`: details, inventory totals (`lead_count`, `grr_count`, `unknown_count`, `nonlead_count`), readiness flags, last notice date, scheduled replacements.
- `ServiceLine`: one customer line, its material and how it was identified.
- `NoticeBatch`: a queued batch of annual notices.

Identifying an unknown line moves one count on its `WaterSystem` to the material found.

### Field work and device sync

- On a system page, office staff tick service lines and assign them to a team member (`ServiceLine.assigned_to`, `assignment_status` `open`/`done`). Rules are in `src/lib/fieldwork.js`.
- The assignee sees them under Field work → Mine on their phone. Saving a visit updates the line, uploads the photo with `UploadPrivateFile` (viewed through short-lived signed links), marks the assignment done and moves the system's count.
- Desktop and phone stay in sync through Base44 realtime subscriptions on `WaterSystem` and `ServiceLine` (`src/lib/DataContext.jsx`). Both also refetch when the app returns to the foreground or the device comes back online, in case events were missed while a phone slept.

### Offline recording and photos

- Every field visit is saved to the phone first (IndexedDB: `src/lib/offline-store.js`), then uploaded by `src/lib/sync-visits.js`. With signal that happens at once; without it, the visit waits under "Waiting to upload" and the header shows the count. Uploads retry when the device comes back online or to the foreground, and every 30 seconds while anything waits. A visit keeps the time it was recorded, and the system count moves from the line's material on the server at upload time.
- Refusals that retrying won't fix (line deleted, no permission) are marked on the visit, which the tech can retry or discard. Photo upload progress is saved, so a dropped connection doesn't upload a photo twice.
- The tech's assignments are kept on the phone, so the list still shows with no signal. The app must have been opened with signal at least once; it does not yet install as an offline app (no service worker).
- Photos: an in-app camera (live viewfinder, falls back to the phone's camera app) or the photo library, up to 5 per entry, downscaled to 1600 px JPEG. Any service line can get photos from the system page too. All photos are private files in `ServiceLine.photo_uris`, viewed through 10-minute signed links.

### Teams

- `Team`: an operator company (`name`, `invite_code`). Created and changed only by server functions; members can read their own team, and only the owner can read `invite_code`.
- `User.team_id` / `User.team_role` (`owner` or `member`) are locked by field-level security (`write: false`), so users can't put themselves on a team. The server functions in `src/lib/server-fns.js` are the only way to set them: each runs `requireUser`, then the rules in `src/lib/team.js`, then uses the service role (`src/lib/team-service.js`).
- `WaterSystem`, `ServiceLine` and `NoticeBatch` carry `team_id`. Row-level security lets every member of that team read and edit them; a record with no `team_id` is personal and visible only to its creator. `team_id` can be set on create but not changed afterwards except by the server.
- Creating a team moves the owner's personal records into it. Joining offers the same. Leaving or being removed ends access at once; records stay with the team. Owners can't leave (remove the other members first).

### Rules encoded (confirm before relying on them)

Calculations live in `src/lib/lcri.js` and are covered by `npm test`.

- Replacement pool = lead + GRR + unknown lines; year-1 target = 10% of the pool, rounded up.
- An annual notice counts as current for 365 days.
- Readiness: *Ready* with all four checklist items done; *Behind* with over 25% unknown and at most one item done; *On track* with three items done or at most 10% unknown; otherwise *At risk*.
- The letter wording and CSV layout are placeholders; each state has its own template.

These are planning aids, not compliance advice.

### Next build steps

- Ownership transfer and team deletion.
- CSV import of service-line inventories.
- Per-state filing templates and a mailing integration.

---

# Base44 App — TanStack Start

A full-stack Base44 app: [TanStack Start](https://tanstack.com/start) (React 19, plain JavaScript) with file-based routes, server functions and server routes, server-rendered and hosted by Base44.

## What is in the starter

| Route | File |
| --- | --- |
| `/` | `src/routes/index.jsx` — a placeholder home page, replaced by the app's own |

## Run locally

```bash
npm ci
base44 login   # one-time per machine
base44 link    # one-time per clone
base44 dev     # local backend + app together
```

## Build and publish

```bash
npm run build         # -> dist/client (assets) + dist/server (the Worker)
base44 deploy         # or publish from the Base44 builder
```

There is no `index.html`: the HTML document is rendered on the server from `src/routes/__root.jsx`. The build runs through the [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/), so dev and build both execute server code in `workerd`.

## How the pieces fit

- **Pages** are files in `src/routes/`. A route's `loader` runs on the server for a document request and in the browser for a client navigation; `Route.useLoaderData()` gives the component the resolved data.
- **Server functions** (in `src/lib/server-fns.js`, created with the first one) are RPCs created with `createServerFn`. `src/start.js` runs every one of them through `authMiddleware`, which sends the visitor's token along, so `context.getBase44()` returns a client acting as that visitor and entity access rules apply. `context.getBase44().asServiceRole` bypasses them, so use it only after authenticating the caller (`.middleware([requireUser])`) and checking they may access the records involved: server functions and server routes are public endpoints anyone can call with any input. See **Server Security** in `AGENTS.md`. Call it only in handlers that need Base44: it reads the platform headers, and a handler that never calls it works without them.
- **Secrets** are read in server code with `import { secrets } from "base44:runtime"` → `secrets.get("NAME")`, inside a handler. Never `process.env`.
- **Server routes** (`src/routes/api/*.js`) are raw HTTP endpoints for URLs something other than the app's own code requests (webhooks, downloads, feeds); the app's pages call server functions. `src/start.js` runs every request through `base44RequestMiddleware`, so their `server.handlers` receive the same `context.getBase44()` (`({ request, params, context }) => …`).
- **Server-only code** lives in `*.server.js` files (TanStack refuses to bundle them for the browser).
- **Auth** is resolved client-side after hydration (`useAuth()`); the server is anonymous on a document request, so give per-user pages `ssr: false`.
- **Sign-in and gated pages** are not wired in the starter: `src/components/auth/` holds the pages (login, register, password reset, MCP consent) and a login gate for `src/routes/_authed/`, to add when the app needs them. See **Adding Authentication** in `AGENTS.md`.
- **AI**: TanStack AI is installed and runs on the Base44 AI gateway, with no API key and usage billed to the app's AI credits. `gatewayModel(context.getBase44())` in `src/lib/ai.server.js` builds the adapter; `AGENTS.md` has a streaming chat example (a server function plus `useChat`).
- **Caching**: the platform caches only what a route opts into via `headers()` (`Cache-Control: public, s-maxage=…`). Everything else is served fresh.
