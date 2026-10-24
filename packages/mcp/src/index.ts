import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = process.env.TRIP_API_URL ?? "http://localhost:8787";
const TOKEN = process.env.TRIP_TOKEN ?? ""; // use the propose token for an LLM client

async function call(path: string, init: RequestInit = {}) {
  const r = await fetch(API + path, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` } });
  return { isError: !r.ok, content: [{ type: "text" as const, text: await r.text() }] };
}

const tripId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/).describe("Trip id from list_trips.");
const op = z.object({
  op: z.enum(["set", "add", "remove"]),
  path: z.string().describe("Path such as days/0/title or dreams/-. Use '-' as the last segment to append to a list."),
  value: z.unknown().optional(),
});
const trip = (id: string) => `/api/trips/${encodeURIComponent(id)}`;

const server = new McpServer({ name: "trip-planner", version: "0.2.0" });
server.tool("list_trips", "List all trips with their ids, titles and current revision numbers.", {}, () => call("/api/trips"));
server.tool("get_trip", "Read one whole itinerary including its current revision number.", { tripId }, (a) => call(trip(a.tripId)));
server.tool("validate_plan", "List problems in a stored itinerary, such as unknown references or bookings outside the trip.", { tripId }, (a) => call(`${trip(a.tripId)}/check`));
server.tool(
  "propose_change",
  "Propose changes to an itinerary (days, activities, places, bookings, tasks, dreams, budget, travelers). Always call with dryRun true first. Changes from this client are stored as proposals and only applied after a user approves them.",
  { tripId, baseRevision: z.number().int(), ops: z.array(op).min(1), reason: z.string(), dryRun: z.boolean().default(true) },
  ({ tripId, ...body }) => call(`${trip(tripId)}/changes`, { method: "POST", body: JSON.stringify(body) }),
);
server.tool("list_proposals", "List the proposals for a trip and their status.", { tripId }, (a) => call(`${trip(a.tripId)}/proposals`));

await server.connect(new StdioServerTransport());
