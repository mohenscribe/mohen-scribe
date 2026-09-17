# Mohen Scribe

Mohen Scribe is a starter ChatGPT/Codex plugin that turns supported audio and video files into editable text. It includes:

- A Streamable HTTP MCP endpoint at `/mcp`
- A browser uploader at `/`
- A multipart transcription endpoint at `/api/transcribe`
- Optional speaker-labelled transcription
- A local stdio MCP entry point for Codex

## Requirements

- Node.js 20 or newer
- An OpenAI API key

## Run locally

```bash
cp .env.example .env
npm install
set -a && . ./.env && set +a
npm start
```

Open `http://localhost:8787`. The MCP endpoint is `http://localhost:8787/mcp`.

## Connect to ChatGPT

Deploy the service to an HTTPS host, set `PUBLIC_BASE_URL` to that public origin, and add `https://your-domain.example/mcp` in ChatGPT developer mode.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Server-side transcription credential |
| `PORT` | No | HTTP port; defaults to `8787` |
| `PUBLIC_BASE_URL` | For deployment | Public HTTPS origin used by the plugin card |
| `MAX_UPLOAD_MB` | No | Upload limit; defaults to `25` |
| `ENABLE_LOCAL_FILES` | Local only | Enables trusted local-path transcription in stdio mode |

Never commit `.env` or an API key. Uploaded temporary files are deleted after each request.

## Current starter limitations

- Files are processed synchronously.
- Files larger than 25 MB must be compressed or split before upload.
- Production use should add authentication, per-user rate limits, durable job storage, privacy/retention controls, and stronger URL-download SSRF protection.

## License

MIT
