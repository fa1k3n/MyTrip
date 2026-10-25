# trip-platform (public)

Generic trip planning platform. No personal data lives here: trips are JSON files (`<id>.trip.json`, one per trip) validated by `packages/schema`.

- `packages/schema`: zod schema, pure change engine (`applyOps`) and plan checks (`checkTrip`).
- `apps/api`: Hono API (read, propose, approve, share links, admin login). Runs on Node with a file store (`src/node.ts`) and as a Cloudflare Worker with a D1 store (`src/worker.ts`, migrations in `migrations/`). The Worker configuration lives outside this repository.
- `packages/mcp`: MCP server (stdio) so an LLM can read the plan and propose changes.
- `apps/web`: React + Tailwind v4 front end: start page (Drömmar) with all trips, trip page with the tabs Önska (wishes and votes), Nåla (plan), Uppleva (today during the trip) and Summera (shared costs, payments and budget follow-up), admin view. Weather from Open-Meteo.

```
npm install
npm run seed             # copies the example trips into data/ (or: npm run seed -- <dir>)
export TRIP_READ_TOKEN=r TRIP_PROPOSE_TOKEN=p TRIP_ADMIN_TOKEN=a
npm run dev:api          # http://localhost:8787
VITE_TRIP_TOKEN=a npm run dev:web   # http://localhost:5173 (TRIP_API_URL changes the proxy target)
TRIP_TOKEN=p npm run mcp # MCP over stdio, proposing only
npm test                 # schema, API and web logic tests (Node 22.18+)
```
Tokens: **read** sees the plan without sensitive fields, **propose** (give this one to an LLM) can only create proposals, **admin** applies, approves and rejects.

## Example trips

`examples/` holds two fictional trips with cover images: Höstlovsresa till Berlin (under way, shows Uppleva) and Sommar i Skåne (finished, with shared costs between three people in Summera). `npm run seed` copies them into the data folder (`TRIP_DIR`, default `data/`). Existing trips are kept; add `-- --force` to overwrite them. The API reads the folder on every request, so seeded trips show up in a running instance after a page reload.
