# CLAUDE.md — SonIA Web UI

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Custom chat interface for SonIA (Soutec's corporate AI assistant), replacing Open WebUI. Runs on NVIDIA Jetson AGX Orin 64GB. Connects to the existing RAG Gateway at `localhost:8090`.

**Location:** `/data/AI_Projects/SonIA/web-ui/` (Jetson)
**Port:** 3001
**Stack:** React 19 + Vite 6 + Tailwind 3 (frontend), Express 4 + SQLite (backend), Docker (deployment)

## Commands

```bash
# Build and run (production — Docker, ARM64)
cd /data/AI_Projects/SonIA/web-ui
docker compose up --build -d

# Rebuild after code changes
docker compose down && docker compose up --build -d

# View logs
docker compose logs -f

# Health check
curl http://localhost:3001/health

# API smoke test
curl http://localhost:3001/api/chats

# Delete DB and rebuild (schema change)
rm -f data/sonia.db data/sonia.db-wal data/sonia.db-shm
docker compose down && docker compose up --build -d

# Seed test data (requires gateway running on :8090)
bash test_seed.sh
```

## Architecture

```
Browser (:3001)
  |
  |  GET /              --> Vite SPA (React)
  |  POST /api/chats/*  --> Express API
  v
Express.js (server/index.js)
  |
  |  SQLite WAL (data/sonia.db)  --> chat persistence
  |  Proxy POST                  --> localhost:8090/v1/chat/completions
  v
RAG Gateway (:8090) -- DO NOT MODIFY
```

**Gateway does NOT support streaming.** The proxy sends a regular fetch, waits for the complete JSON response, then returns both user and assistant messages to the browser. The frontend shows a typing indicator while waiting.

### Model mapping (in `server/routes/proxy.js`)
- `sonia-local` --> `sonia-qwen:9b` (local model)
- `sonia-gemini` --> `Gemini-3.0-pro-preview` (frontier model)

### Client-side caching (IndexedDB)
- `useConversationCache.js` manages an IndexedDB database "sonia-cache" with 2 stores: `conversations` and `messages`
- On app load: reads from IndexedDB instantly, then syncs with SQLite in the background
- On send/receive: writes to both SQLite (via API) and IndexedDB (write-through)
- Search is LOCAL over IndexedDB (no server round-trip), with 150ms debounce and snippet highlighting

## Key files

| File | Purpose |
|------|---------|
| `server/index.js` | Express entry point, serves API + static SPA |
| `server/db.js` | SQLite schema, prepared statements, all DB functions |
| `server/routes/chats.js` | CRUD: GET/POST/PUT/DELETE /api/chats |
| `server/routes/proxy.js` | POST /api/chats/:id/messages (gateway proxy) |
| `src/App.jsx` | Root component wiring: cache -> search -> chat |
| `src/hooks/useChat.js` | Central chat state, optimistic UI, write-through cache |
| `src/hooks/useConversationCache.js` | IndexedDB management |
| `src/hooks/useSearch.js` | Local search over IndexedDB |
| `src/components/MessageBubble.jsx` | Message rendering: markdown, images, source citations |
| `src/components/InputArea.jsx` | Message input: auto-resize, image attach (base64), Enter to send |

## Design conventions

- **Theme:** Soutec brand palette — navy-800 primary, teal-400/600 accents, DM Sans body, Space Mono code
- **Dark mode:** `darkMode: 'class'` on `<html>`, persisted in `localStorage('sonia-theme')`, fallback to `prefers-color-scheme`
- **Localization:** All UI strings in Spanish (es-VE). Time formatting uses `es-VE` locale
- **Chat grouping:** Client-side temporal grouping: Hoy / Ayer / Ultimos 7 dias / Anteriores
- **Images:** Stored as base64 data URLs in SQLite `images TEXT` column (JSON array). Thumbnails max-width 300px, full-size lightbox on click
- **Sources:** Assistant responses may end with `\n\nFuentes:\n...`. Parsed by `extractSources()` and rendered in a grey footer with teal bullets

## Docker (ARM64 / Jetson)

- Base image: `node:20-slim` (supports linux/arm64 natively)
- `better-sqlite3` needs `python3 make g++` for native compilation on ARM64 — installed in production stage
- `network_mode: host` required to reach gateway at localhost:8090
- Volume `./data:/app/data` persists SQLite DB across container restarts
- **Do NOT use Alpine** (musl incompatible with better-sqlite3 prebuilds)

## Critical rules

1. **Never modify the RAG Gateway** at :8090 — it's a shared service
2. **SQLite is source of truth** — IndexedDB is a read-through cache only
3. **Images are base64** — sent inline in the JSON body, stored in SQLite. Express JSON limit is 15MB
4. **Gateway timeout:** 60s (AbortController in proxy.js). Long responses from the model may take 30-50s
5. **Port 3001 only** — ports 80 (Open WebUI), 8000 (TensorRT-LLM), 8001 (TTS), 8090 (Gateway) are occupied
