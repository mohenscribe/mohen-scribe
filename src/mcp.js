import { basename, extname, join } from "node:path";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { SUPPORTED_EXTENSIONS, transcribeFile } from "./transcribe.js";

const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "http://localhost:8787";

const outputSchema = {
  transcript: z.string(),
  segments: z.array(z.object({
    speaker: z.string(),
    start: z.number(),
    end: z.number(),
    text: z.string(),
  })),
};

function resultPayload(result) {
  return {
    structuredContent: {
      transcript: result.text,
      segments: result.segments,
    },
    content: [{ type: "text", text: result.text || "No speech was detected." }],
  };
}

function safeExtension(value) {
  const extension = extname(value.split("?")[0]).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported media type. Use mp3, mp4, mpeg, mpga, m4a, wav, or webm.");
  }
  return extension;
}

function assertPublicHttpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("The media URL must use HTTPS.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) {
    throw new Error("Local and private media URLs are not allowed.");
  }
  return url;
}

async function downloadMedia(mediaUrl) {
  const url = assertPublicHttpsUrl(mediaUrl);
  const extension = safeExtension(url.pathname);
  const directory = join(tmpdir(), `mohen-scribe-${randomUUID()}`);
  const filePath = join(directory, `media${extension}`);
  await mkdir(directory, { recursive: true });

  const response = await fetch(url, { redirect: "error" });
  if (!response.ok || !response.body) {
    throw new Error(`Unable to download media (HTTP ${response.status}).`);
  }
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_BYTES) throw new Error("Media exceeds the configured upload limit.");

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error("Media exceeds the configured upload limit.");
  await writeFile(filePath, bytes);
  return { directory, filePath };
}

export function createMohenScribeServer(widgetHtml) {
  const server = new McpServer(
    { name: "mohen-scribe", version: "0.1.0" },
    {
      instructions:
        "Use Mohen Scribe only when the user asks to transcribe audio or video. Ask whether speaker labels are needed when multiple people may be speaking.",
    }
  );

  registerAppResource(
    server,
    "mohen-scribe-uploader",
    "ui://widget/mohen-scribe.html",
    {},
    async () => ({
      contents: [{
        uri: "ui://widget/mohen-scribe.html",
        mimeType: RESOURCE_MIME_TYPE,
        text: widgetHtml.replaceAll("{{PUBLIC_BASE_URL}}", PUBLIC_BASE_URL),
      }],
    })
  );

  registerAppTool(
    server,
    "open_mohen_scribe",
    {
      title: "Open Mohen Scribe",
      description: "Open the Mohen Scribe upload interface for audio or video transcription.",
      inputSchema: {},
      outputSchema: { uploadUrl: z.string().url() },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      _meta: { ui: { resourceUri: "ui://widget/mohen-scribe.html" } },
    },
    async () => ({
      structuredContent: { uploadUrl: PUBLIC_BASE_URL },
      content: [{ type: "text", text: `Open Mohen Scribe at ${PUBLIC_BASE_URL}` }],
    })
  );

  server.registerTool(
    "transcribe_media_url",
    {
      title: "Transcribe media URL",
      description: "Transcribe a public HTTPS audio or video URL. Use diarize=true when speaker labels are needed.",
      inputSchema: {
        media_url: z.string().url(),
        diarize: z.boolean().optional().default(false),
        language: z.string().length(2).optional(),
        prompt: z.string().max(1000).optional(),
      },
      outputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false },
    },
    async ({ media_url, diarize, language, prompt }) => {
      let temporary;
      try {
        temporary = await downloadMedia(media_url);
        const result = await transcribeFile(temporary.filePath, { diarize, language, prompt });
        return resultPayload(result);
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : "Transcription failed." }],
        };
      } finally {
        if (temporary?.directory) await rm(temporary.directory, { recursive: true, force: true });
      }
    }
  );

  if (process.env.ENABLE_LOCAL_FILES === "true") {
    server.registerTool(
      "transcribe_local_file",
      {
        title: "Transcribe local media file",
        description: "Transcribe a local audio or video file in a trusted Codex environment.",
        inputSchema: {
          file_path: z.string().min(1),
          diarize: z.boolean().optional().default(false),
          language: z.string().length(2).optional(),
          prompt: z.string().max(1000).optional(),
        },
        outputSchema,
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      },
      async ({ file_path, diarize, language, prompt }) => {
        try {
          const info = await stat(file_path);
          if (!info.isFile()) throw new Error("The path is not a file.");
          if (info.size > MAX_BYTES) throw new Error("Media exceeds the configured upload limit.");
          safeExtension(basename(file_path));
          return resultPayload(await transcribeFile(file_path, { diarize, language, prompt }));
        } catch (error) {
          return {
            isError: true,
            content: [{ type: "text", text: error instanceof Error ? error.message : "Transcription failed." }],
          };
        }
      }
    );
  }

  return server;
}
