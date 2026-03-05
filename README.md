# Discord Channel Scraper

Export Discord channel message history to plain text files without hitting rate limits. Uses a Python FastAPI backend and Next.js web UI.

> **Important:** Requires your own Discord user or bot token. Never commit or share your token.

## Features

- Content-only export of text channels
- Forum support (threads exported as titled blocks with comments)
- Rate-limit friendly pacing and retry logic
- Downloadable `.txt` files named by channel (e.g. `general.txt`)
- Optional batch script to export multiple channels sequentially

## Project Structure

```
├── backend/          Python FastAPI + WebSocket server
├── frontend/         Next.js web UI
└── frontend/scripts/ scrape-sequential.js (batch export)
```

## Prerequisites

- Node.js ≥ 18
- pnpm (recommended)
- Python ≥ 3.10
- Discord token (user or bot)

## Quick Start

### 1. Install dependencies

```bash
pnpm install
cd backend && pip install -r requirements.txt
```

### 2. Configure environment

**Backend** – create `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

**Frontend** – create `frontend/.env.local`:

```bash
cp frontend/.env.local.example frontend/.env.local
```

Set `NEXT_PUBLIC_WS_URL` and `NEXT_PUBLIC_DOWNLOAD_URL` if not using defaults (localhost:8000).

### 3. Run

```bash
pnpm dev
```

This starts the backend (port 8000) and frontend (port 3000). Open http://localhost:3000.

## Configuration

### Backend (`backend/.env`)

| Variable      | Default    | Description                    |
|---------------|------------|--------------------------------|
| PORT          | 8000       | HTTP and WebSocket port        |
| DOMAIN        | localhost  | Domain for production          |
| WEBSITE_URL   | -          | Allowed CORS origin (optional)  |
| ALLOWED_ORIGINS | -        | Comma-separated CORS origins    |

### Frontend (`frontend/.env.local`)

| Variable              | Default              | Description              |
|------------------------|----------------------|--------------------------|
| NEXT_PUBLIC_WS_URL     | ws://localhost:8000/ws | WebSocket endpoint     |
| NEXT_PUBLIC_DOWNLOAD_URL | http://localhost:8000 | Download base URL     |
| DISCORD_TOKEN         | -                    | For batch script only    |

## API

- `GET /health` – Health check
- `GET /download/{id}` – Download export as `.txt`
- `WS /ws` – WebSocket for exports

## Batch Export

To export multiple channels sequentially:

1. Add `DISCORD_TOKEN` to `frontend/.env.local`
2. Edit `frontend/scripts/scrape-sequential.js` – set the `channels` map (name → ID)
3. Run:

```bash
cd frontend && pnpm scrape:batch
```

Exports are saved to `frontend/exports/`.

## Security

- Do not commit `.env`, `.env.local`, or any file containing tokens
- Treat Discord tokens as passwords; rotate if exposed
- Use an alt account when possible

## Contributing

Issues and pull requests are welcome. For larger changes, open an issue first.

## License

ISC – see [LICENSE](LICENSE).
