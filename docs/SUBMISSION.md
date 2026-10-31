# Submission (GDG London Agentic Hackathon form)

**Project title:** Plan B

**Team name:** Plan B

**Project type:** Solo

**Built with:** Gemini, Vertex AI, Google ADK, Cloud Run, Next.js, Other (MCP, TfL Unified API)

**GitHub repository URL:** https://github.com/boranfurkan/planb

**Demo video URL:** (add after recording, max 3 minutes)

**App purpose:**

Last Sunday, staff at Lee station told me every train was cancelled because of the wind. Google Maps and Citymapper still sent me through Lee. I didn't know my options, so I guessed: a taxi to Lewisham, a bigger station. Journey apps only know what their feeds know, and the feeds lag behind the people at the gate.

Plan B is an agent you tell what the staff just told you, by typing or speaking. It treats your report as true and works out what it knocks out: every station near Lee is Southeastern, so the nearest stations are useless. It finds the nearest interchange on a *different* network (Lewisham, with the DLR), checks every line live, prices a taxi hop, and gives you Plan A and Plan B against your deadline, read aloud if you want. Your report is shared, so the next traveller is warned before the official feeds catch up, and it remembers lasting preferences like "no taxis".

How it works: a Google ADK (TypeScript) multi-agent system on Gemini via Vertex AI. A situation analyst hands structured state to three scouts running in parallel (transit, escape hub, taxi), then a verifier loop live-checks every line and re-plans what fails, then a presenter ranks the options. All live data comes through our own London Live MCP server (TfL journey planner, line status, live departures, stations, OpenStreetMap routing). A callback guardrail keeps reported-broken lines out of every plan. Voice in (speech recognition) and out (Gemini TTS). Deployed on Cloud Run.
