import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
(async () => {
  const c = new Client({ name: "probe", version: "0" });
  await c.connect(new StreamableHTTPClientTransport(new URL(process.env.MCP_URL || "http://127.0.0.1:3000/api/mcp")));
  const { tools } = await c.listTools();
  console.log("tools:", tools.map((t) => t.name).join(", "));
  const r = await c.callTool({ name: "line_status", arguments: { line_ids: ["southeastern", "dlr", "northern"] } });
  console.log(JSON.stringify(r).slice(0, 400));
  await c.close();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
