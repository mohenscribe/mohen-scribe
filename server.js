import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import formidable from "formidable";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMohenScribeServer } from "./src/mcp.js";
import { SUPPORTED_EXTENSIONS, transcribeFile } from "./src/transcribe.js";

const here = dirname(fileURLToPath(import.meta.url));
const widgetHtml = readFileSync(join(here, "public", "widget.html"), "utf8");
const homeHtml = readFileSync(join(here, "public", "index.html"), "utf8");
const port = Number(process.env.PORT ?? 8787);
const maxBytes = Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(body));
}

async function handleUpload(req, res) {
  const form = formidable({
    maxFiles: 1,
    maxFileSize: maxBytes,
    allowEmptyFiles: false,
    filter: ({ originalFilename }) => {
      const match = String(originalFilename ?? "").toLowerCase().match(/\.[a-z0-9]+$/);
      return Boolean(match && SUPPORTED_EXTENSIONS.has(match[0]));
    },
  });

  let uploadedPath;
  try {
    const [fields, files] = await form.parse(req);
    const media = Array.isArray(files.media) ? files.media[0] : files.media;
    if (!media?.filepath) throw new Error("Choose a supported audio or video file.");
    uploadedPath = media.filepath;
    const diarize = String(Array.isArray(fields.diarize) ? fields.diarize[0] : fields.diarize) === "true";
    const language = Array.isArray(fields.language) ? fields.language[0] : fields.language;
    const prompt = Array.isArray(fields.prompt) ? fields.prompt[0] : fields.prompt;
    const result = await transcribeFile(uploadedPath, { diarize, language, prompt });
    json(res, 200, { ok: true, ...result });
  } catch (error) {
    json(res, 400, { ok: false, error: error instanceof Error ? error.message : "Transcription failed." });
  } finally {
    if (uploadedPath) await rm(uploadedPath, { force: true });
  }
}

const httpServer = createServer(async (req, res) => {
  if (!req.url) return res.writeHead(400).end("Missing URL");
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type, mcp-session-id",
      "access-control-expose-headers": "Mcp-Session-Id",
    });
    return res.end();
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(homeHtml);
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, service: "mohen-scribe", version: "0.1.0" });
  }

  if (req.method === "POST" && url.pathname === "/api/transcribe") {
    return handleUpload(req, res);
  }

  const mcpMethods = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === "/mcp" && req.method && mcpMethods.has(req.method)) {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-expose-headers", "Mcp-Session-Id");
    const mcpServer = createMohenScribeServer(widgetHtml);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close();
      mcpServer.close();
    });
    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("MCP request failed:", error);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => {
  console.log(`Mohen Scribe is running at http://localhost:${port}`);
  console.log(`MCP endpoint: http://localhost:${port}/mcp`);
});
