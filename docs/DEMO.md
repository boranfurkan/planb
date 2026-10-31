# Demo script (pitch and the 3-minute video)

Before you start: open the deployed URL in Chrome, allow the microphone once, and have a second phone on the same URL. A fresh deploy or server restart clears old test reports.

| Time | Say | Show |
|---|---|---|
| 0:00 | "Last Sunday I was at Lee station, on my way here to pitch. Staff at the entrance: every train cancelled, wind. Google Maps and Citymapper still told me to take the train from Lee." | Hero page: "Your station just closed. The apps don't know yet." |
| 0:20 | "I didn't know my options. I guessed: Uber to Lewisham, a bigger station. It worked, but I worked it out alone. Plan B is the agent I wanted." | |
| 0:30 | Tap the mic: "I'm at Lee station. Staff say all trains are cancelled because of the wind. I need to be at Encode Hub by 15:00." | Live transcript under the box |
| 0:40 | "Six agents built with Google ADK. The analyst records my report and scans the stations: every station near Lee is Southeastern, so they're all hit." | Pipeline lights up; map shows ✕ stations hit |
| 0:55 | "Now three scouts run in parallel: public transport around the problem, a hop to an interchange on a different network, and a taxi as the fallback. Every call goes through our own MCP server over live TfL data." | Scouts glow side by side; live tool calls stream; ★ Lewisham on the map |
| 1:15 | "The verifier loop checks every line live and re-plans anything with severe delays. A guardrail callback makes sure no agent can route through the line I reported, even if the model forgets." | Verifier glows |
| 1:35 | "Plan A: get to Lewisham, the DLR is running. Note the badge: the official feed doesn't show this yet. It planned from my report." | Plan tickets slide in; voice reads Plan A aloud |
| 2:00 | "And my report is shared. The next traveller at Lee is warned before the official feeds catch up." | Second phone: red traveller-reports ticker |
| 2:15 | "And it isn't only trains. Driving, a crash ahead that no app shows yet:" click 🚗 Crash ahead on the A2 | Road scout; map: red blocked route, green detour, "Reported incident" |
| 2:35 | "ADK sequential, parallel and loop agents, callbacks and user-scoped memory; our own MCP server; Gemini on Vertex AI with Gemini TTS; deployed on Cloud Run." | Pipeline header, then the GitHub README |
| 2:50 | "Plan B: when the station knows before the app does." | |

A run takes 60–90 seconds: talk through the pipeline while it works. In the video, cut the waiting to keep it under 3 minutes.
