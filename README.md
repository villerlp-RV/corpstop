# Lead Pipe — LCRI operator console

A console for contract water operators who run many small community water systems. It tracks readiness for the federal Lead and Copper Rule Improvements (LCRI) compliance date of **1 Nov 2027** across a whole portfolio.

| Route | What it does |
| --- | --- |
| `/` | Portfolio: every system with readiness, material mix, unknown share, year-1 replacement target, plan and notice status. Add systems, load or remove example data. |
| `/systems/$id` | One system: inventory totals, readiness checklist, replacement pace, service lines with field verification of unknown lines. |
| `/notices` | Pick systems, preview the annual notice letter, queue a batch for print and mail. |
| `/reports` | Systems grouped by state, with a CSV of inventory totals to copy or download. |

All pages sit under `src/routes/_authed/` (sign-in required). Page components are in `src/components/lcri/`, styles in `src/lcri.css` (scoped under `.lcri-app`).

### Data (`base44/entities`)

- `WaterSystem`: details, inventory totals (`lead_count`, `grr_count`, `unknown_count`, `nonlead_count`), readiness flags, last notice date, scheduled replacements.
- `ServiceLine`: one customer line, its material and how it was identified.
- `NoticeBatch`: a queued batch of annual notices.

Each entity is private to the user who created it (row-level security on `created_by_id`). Identifying an unknown line moves one count on its `WaterSystem` to the material found.

### Rules encoded (confirm before relying on them)

Calculations live in `src/lib/lcri.js` and are covered by `npm test`.

- Replacement pool = lead + GRR + unknown lines; year-1 target = 10% of the pool, rounded up.
- An annual notice counts as current for 365 days.
- Readiness: *Ready* with all four checklist items done; *Behind* with over 25% unknown and at most one item done; *On track* with three items done or at most 10% unknown; otherwise *At risk*.
- The letter wording and CSV layout are placeholders; each state has its own template.

These are planning aids, not compliance advice.

### Next build steps

- Team accounts so an operator's field techs share its systems.
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
