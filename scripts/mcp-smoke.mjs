// Tool discovery only. Use a separate server/home so the real server's token and queue stay intact.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const home = mkdtempSync(join(tmpdir(), "flow-mcp-smoke-"));
const client = new Client({ name: "flow-mcp-smoke", version: "1" });
try {
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
    env: { ...process.env, FLOW_MCP_PORT: "0", FLOW_MCP_HOME: home },
    stderr: "pipe",
  }));
  const { tools } = await client.listTools();
  for (const name of ["flow_generate", "flow_download", "flow_wait", "flow_status"]) {
    assert.ok(tools.some((tool) => tool.name === name), `Missing tool: ${name}`);
  }
  console.log(`PASS: isolated MCP startup and discovery (${tools.length} tools); no Flow jobs submitted.`);
} finally {
  await client.close();
  rmSync(home, { recursive: true, force: true });
}
