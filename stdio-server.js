import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMohenScribeServer } from "./src/mcp.js";

const here = dirname(fileURLToPath(import.meta.url));
const widgetHtml = readFileSync(join(here, "public", "widget.html"), "utf8");
const server = createMohenScribeServer(widgetHtml);
await server.connect(new StdioServerTransport());
