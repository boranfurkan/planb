# Plan B

**When the station knows before the app does.**

Last Sunday at Lee station, staff at the entrance said every train was cancelled because of the wind. Google Maps and Citymapper still routed me through Lee. I didn't know my options, so I guessed: a taxi to Lewisham, a bigger station with more lines. It worked, but I worked it out alone and late.

Think of it as the "my situation isn't on the map yet" button your maps app is missing. When the apps are right, use the apps. Plan B is for the gap, on public transport or on the road, and when the official feeds catch up it uses them too.

Plan B is an agent you tell what the staff just told you (or what you see on the road ahead). It treats your report as true, works out what it knocks out, finds the nearest interchange **on a different network**, checks every line live, prices a taxi hop, and gives you a Plan A and a Plan B. Your report is then shared, so the next traveller is warned before the official feeds catch up.

Built for the GDG London AI DevCamp Agentic Hackathon (31 October 2026).

## How it works

A multi-agent system built with the **Google Agent Development Kit (ADK, TypeScript)** on **Gemini via Vertex AI**. Every live-data tool is served by our own **MCP server**.

```
plan_b (SequentialAgent)
  1. situation_analyst        understands the report, locates places, records it for other travellers,
                              finds which nearby stations it knocks out and which interchanges still work
  2. scouts (ParallelAgent)   three scouts look for a way out at the same time
       transit_scout          public transport straight from you, avoiding what is broken
       hub_scout              taxi hop to the best escape hub, then onward (with live departures)
       taxi_scout             door to door, the fallback
       road_scout             drivers: detours around the incident (blocked route vs clear detours)
  3. verify_loop (LoopAgent)  live status of every line in every option; re-plans an option that fails
  4. presenter                ranks by deadline, reliability and cost; shows Plan A / Plan B
```

ADK features used, each for a reason:

| Feature | Why |
|---|---|
| `SequentialAgent`, `ParallelAgent`, `LoopAgent` | Scouts run in parallel so a stressed traveller waits less; the verifier loops until the options hold up |
| `MCPToolset` → London Live MCP server (`/api/mcp`) | All live data goes through one MCP server that any MCP client can use |
| `FunctionTool` with `ToolContext` state | `report_disruption` records the report and locks the broken lines for the whole conversation |
| `beforeToolCallback` guardrail | No agent can plan through a line the traveller reported as down, even if the model forgets |
| `beforeAgentCallback` | Fetches the live status of every line the scouts used before the verifier thinks (one model round trip saved) |
| `outputKey` + session state | Agents hand structured JSON to each other |
| `beforeAgentCallback` on scouts | Scouts that don't apply (Tube scouts for a driver, the road scout for a commuter) are skipped in code, with no model call |
| `EXIT_LOOP`, `skipSummarization` | The loop ends when every option is checked; the plan cards are the answer, with no extra model call |
| Thinking level `LOW`; scouts on `gemini-3.5-flash-lite` | Tools do the heavy lifting; the Lee scenario answers in about 26 seconds instead of five minutes, with the same evaluation results |
| `BasePlugin.onToolErrorCallback` (tool resilience plugin) | A dropped MCP connection or a TfL timeout is retried once, then reported to the model instead of crashing the run |
| User-scoped state (`user:preferences`) + `remember_preference` | Lasting preferences like "no taxis" follow the traveller to the next trip |

Voice: speak your situation (browser speech recognition, en-GB) and hear the plan (Gemini TTS, `gemini-3.8-flash-tts`, via `/api/speak`).
Shared reports: `/api/reports` feeds the live ticker, so a second phone sees what the first traveller reported.

### London Live MCP server

| Tool | Source |
|---|---|
| `find_place` | TfL StopPoint search, postcodes.io, OpenStreetMap Nominatim |
| `nearby_stations` | TfL StopPoint: stations grouped into interchanges, marking those with only broken lines |
| `line_status` | TfL Line status (Tube, DLR, Overground, Elizabeth line, National Rail operators, buses) |
| `plan_journey` | TfL Journey Planner, filtered to avoid broken modes and lines |
| `next_departures` | TfL live arrivals |
| `taxi_estimate` | OSRM road route adjusted for London traffic, with a fare range (an estimate, not a quote) |
| `drive_routes` | OSRM driving routes; routes through the reported incident are marked, detours built around it (either side, or turning back) |
| `road_disruptions` | TfL's official road-disruption feed near a point: is the driver ahead of the feed? |

## Run it

```bash
npm install
cp .env.example .env.local    # fill in the values
gcloud auth application-default login   # for Vertex AI
npm run dev                    # http://localhost:3000
```

`.env.local`:

```
GOOGLE_GENAI_USE_ENTERPRISE=true          # Gemini through Vertex AI
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=global
PLANB_MODEL=gemini-3.8-flash
TFL_APP_KEY=                               # optional, raises TfL's rate limit
```

Run the pipeline from the terminal, with timestamps for every step:

```bash
set -a; source .env.local; set +a
npx tsx scripts/run-agent.ts "I'm at Lee station, trains are cancelled because of the wind. I need to be at N1 6DA by 13:45."
```

## Evaluation

`npm run eval` (with `.env.local` loaded and the dev server running) runs real scenarios through the ADK runner, on live TfL data, in parallel, and checks behaviour rather than wording:

| Scenario | Checks |
|---|---|
| Lee, trains cancelled by wind | report recorded against Southeastern; stations scanned with it down; all three scouts run; at least two options; Plan A avoids National Rail; no step rides Southeastern; the insight names an escape hub |
| "I never take taxis" with Lewisham DLR closed | `remember_preference` called; a plan is presented; no option uses a taxi; nothing rides the closed DLR |
| Driver: crash ahead on the A2 | road scout routes around the incident; TfL road feed checked; no public transport planned; a driving plan is presented |
| Destination missing | no plan is guessed; the traveller is asked a question; scouts don't plan journeys |

Latest run: 14/14 checks passed; the Lee scenario answers in about 26 seconds.

## Deploy

Cloud Run (London), built from the `Dockerfile`: `scripts/deploy.sh`. The service account reaches Vertex AI; one always-on instance keeps shared reports consistent and avoids a cold start.

## Code map

```
src/lib/agent.ts            the ADK agents, tools, guardrail and runner
src/lib/mcp-server.ts       London Live MCP server (tools)      →  src/app/api/mcp/route.ts
src/lib/tfl.ts              TfL, postcodes.io, OpenStreetMap and OSRM clients (with caching)
src/app/api/chat/route.ts   runs the agents and streams every step as NDJSON
src/components/plan-b/      the page: pipeline diagram, live tool calls, map, plan tickets
```
