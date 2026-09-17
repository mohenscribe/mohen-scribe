import { createReadStream } from "node:fs";
import OpenAI from "openai";

export const SUPPORTED_EXTENSIONS = new Set([
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".m4a",
  ".wav",
  ".webm",
]);

export function normalizeTranscript(result, diarize) {
  const segments = diarize && Array.isArray(result.segments)
    ? result.segments.map((segment) => ({
        speaker: String(segment.speaker ?? "Speaker"),
        start: Number(segment.start ?? 0),
        end: Number(segment.end ?? 0),
        text: String(segment.text ?? "").trim(),
      }))
    : [];

  const text = typeof result.text === "string"
    ? result.text.trim()
    : segments.map((segment) => `${segment.speaker}: ${segment.text}`).join("\n");

  return { text, segments };
}

export async function transcribeFile(filePath, options = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const diarize = Boolean(options.diarize);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const request = diarize
    ? {
        file: createReadStream(filePath),
        model: "gpt-4o-transcribe-diarize",
        response_format: "diarized_json",
        chunking_strategy: "auto",
      }
    : {
        file: createReadStream(filePath),
        model: "gpt-transcribe",
      };

  if (options.language && !diarize) request.language = options.language;
  if (options.prompt && !diarize) request.prompt = options.prompt;

  const result = await client.audio.transcriptions.create(request);
  return normalizeTranscript(result, diarize);
}
