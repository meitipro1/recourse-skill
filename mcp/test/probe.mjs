/**
 * Talk to the server the way a client does: initialise over Streamable HTTP,
 * list the tools, call each of the five, print what came back.
 *
 *     node test/probe.mjs                          # local dev server
 *     node test/probe.mjs https://recourse-mcp-eight.vercel.app/api/mcp
 *
 * Not a unit test. This is the thing that proves the deployed URL answers.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.argv[2] || "http://localhost:4504/api/mcp";
const client = new Client({ name: "recourse-probe", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));

const listed = await client.listTools();
console.log(`connected to ${url}`);
console.log(`tools: ${listed.tools.map((t) => t.name).join(", ")}\n`);

const calls = [
  ["recourse_check_promise", { promise: "Fast and reliable responses." }],
  ["recourse_check_promise", { promise: "Prices aggregated from at least three venues, refreshed within five seconds." }],
  ["recourse_explain", { topic: "dispute" }],
  ["recourse_get_case", { case_id: "RC-2026-0003" }],
  ["recourse_seller_record", { address: "0x965c98389197055CFb3FD8b1E3e9a11AE6d40C99" }],
  ["recourse_stats", {}],
];

let failures = 0;
for (const [name, args] of calls) {
  const result = await client.callTool({ name, arguments: args });
  const body = result.content?.[0]?.text ?? "";
  const flag = result.isError ? "ERROR" : "ok   ";
  if (result.isError && name !== "recourse_check_promise") failures += 1;
  console.log(`${flag} ${name} ${JSON.stringify(args).slice(0, 70)}`);
  console.log("      " + body.replace(/\s+/g, " ").slice(0, 300) + (body.length > 300 ? " ..." : ""));
  console.log();
}
await client.close();
console.log(failures ? `${failures} tool(s) errored` : "every tool answered");
process.exit(failures ? 1 : 0);
