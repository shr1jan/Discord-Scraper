import asyncio
import logging
import os
import random
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from threading import Lock
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DISCORD_API_BASE = "https://discord.com/api/v10"
USER_AGENT = "DiscordChannelExporter/1.0"
MAX_RETRY_ATTEMPTS = 5
HTTP_TIMEOUT = 25.0


@dataclass
class Config:
    port: str
    domain: str
    website_url: str
    allowed_origins: list[str]
    entry_ttl: int
    cleanup_interval: int


def load_config() -> Config:
    origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if u := os.getenv("WEBSITE_URL"):
        origins.append(u)

    return Config(
        port=os.getenv("PORT", "8000"),
        domain=os.getenv("DOMAIN", "localhost"),
        website_url=os.getenv("WEBSITE_URL", ""),
        allowed_origins=origins,
        entry_ttl=30 * 60,
        cleanup_interval=10 * 60,
    )


@dataclass
class ScrapedContent:
    content: str
    timestamp: datetime
    channel_id: str
    channel_name: str = ""


class ContentStore:
    def __init__(self, ttl: int, interval: int):
        self._data: dict[str, ScrapedContent] = {}
        self._lock = Lock()
        self._ttl = ttl
        self._interval = interval
        self._running = True

    async def _cleanup_loop(self):
        while self._running:
            await asyncio.sleep(self._interval)
            now = datetime.now()
            with self._lock:
                expired = [k for k, v in self._data.items() if (now - v.timestamp).total_seconds() > self._ttl]
                for k in expired:
                    del self._data[k]

    def set(self, id: str, content: ScrapedContent):
        with self._lock:
            self._data[id] = content

    def get(self, id: str) -> Optional[ScrapedContent]:
        with self._lock:
            return self._data.get(id)

    def delete(self, id: str):
        with self._lock:
            self._data.pop(id, None)


config = load_config()
store = ContentStore(config.entry_ttl, config.cleanup_interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(store._cleanup_loop())
    yield
    store._running = False
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Discord Channel Exporter", lifespan=lifespan)

origins = list(config.allowed_origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://localhost(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)


def normalize_token(token: str) -> str:
    return token.strip()


async def discord_get(client: httpx.AsyncClient, url: str, auth: str) -> httpx.Response:
    last_err = None
    for attempt in range(1, MAX_RETRY_ATTEMPTS + 1):
        try:
            resp = await client.get(
                url,
                headers={
                    "Authorization": auth,
                    "User-Agent": USER_AGENT,
                },
                timeout=HTTP_TIMEOUT,
            )
        except Exception as e:
            last_err = e
            await asyncio.sleep(0.2 * attempt)
            continue

        if resp.status_code == 429:
            retry = resp.headers.get("Retry-After") or resp.headers.get("X-RateLimit-Reset-After")
            wait = 2.0
            if retry:
                try:
                    wait = min(float(retry), 30.0)
                except ValueError:
                    pass
            await resp.aclose()
            last_err = Exception(f"Rate limited (429), retry after {wait}s")
            await asyncio.sleep(wait)
            continue

        return resp

    raise last_err or Exception(f"GET {url} failed after {MAX_RETRY_ATTEMPTS} retries")


async def get_json(client: httpx.AsyncClient, url: str, auth: str) -> dict | list:
    resp = await discord_get(client, url, auth)
    try:
        if resp.status_code != 200:
            raise Exception(f"GET {url} -> {resp.status_code}: {resp.text[:500]}")
        return resp.json()
    finally:
        await resp.aclose()


def format_line(msg: dict) -> str:
    txt = (msg.get("content") or "").strip()
    if not txt:
        return ""

    ref = msg.get("referenced_message")
    if ref:
        parent = (ref.get("content") or "").strip()
        if not parent:
            return f'RE: [message_id={ref.get("id", "")}] -> {txt}'
        if len(parent) > 120:
            parent = parent[:120] + "…"
        return f'RE: "{parent}" -> {txt}'
    return txt


async def get_channel_info(client: httpx.AsyncClient, channel_id: str, auth: str) -> tuple[bool, str, str]:
    data = await get_json(client, f"{DISCORD_API_BASE}/channels/{channel_id}", auth)
    is_forum = data.get("type") == 15
    guild_id = data.get("guild_id", "")
    channel_name = (data.get("name") or "").strip() or f"channel-{channel_id}"
    return is_forum, guild_id, channel_name


def _sanitize_filename(name: str) -> str:
    for c in r'\/:*?"<>|':
        name = name.replace(c, "_")
    return name.strip() or "channel"


async def list_forum_threads(
    client: httpx.AsyncClient,
    channel_id: str,
    guild_id: str,
    auth: str,
    send: callable,
) -> list[dict]:
    threads = []

    try:
        active = await get_json(client, f"{DISCORD_API_BASE}/guilds/{guild_id}/threads/active", auth)
        for t in active.get("threads", []):
            if t.get("parent_id") == channel_id:
                threads.append(t)
    except Exception as e:
        await send({"type": "log", "message": f"Active threads lookup skipped: {e}"})

    before = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")
    while True:
        try:
            page = await get_json(
                client,
                f"{DISCORD_API_BASE}/channels/{channel_id}/threads/archived/public?before={before}&limit=100",
                auth,
            )
        except Exception as e:
            await send({"type": "log", "message": f"Archived page error: {e}"})
            break

        items = page.get("threads", [])
        if not items:
            break

        threads.extend(items)
        oldest = items[-1]
        meta = oldest.get("thread_metadata") or {}
        ts = meta.get("archive_timestamp")
        if ts:
            before = ts
        else:
            try:
                dt = datetime.fromisoformat(before.replace("Z", "+00:00"))
                before = (dt - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
            except ValueError:
                break

        if not page.get("has_more", False):
            break
        await asyncio.sleep(0.3)

    return threads


async def get_first_message(client: httpx.AsyncClient, thread_id: str, auth: str) -> str:
    try:
        msgs = await get_json(client, f"{DISCORD_API_BASE}/channels/{thread_id}/messages?after=0&limit=1", auth)
        if msgs:
            return (msgs[0].get("content") or "").strip()
    except Exception:
        pass
    return ""


async def get_all_comments(
    client: httpx.AsyncClient,
    thread_id: str,
    auth: str,
    max_count: int,
) -> list[str]:
    comments = []
    before = ""

    while len(comments) < max_count:
        url = f"{DISCORD_API_BASE}/channels/{thread_id}/messages?limit=50"
        if before:
            url += f"&before={before}"
        try:
            batch = await get_json(client, url, auth)
        except Exception:
            break

        if not batch:
            break

        for m in batch:
            c = (m.get("content") or "").strip()
            if c:
                comments.append(c)
                if len(comments) >= max_count:
                    break

        before = batch[-1]["id"]
        await asyncio.sleep(0.2)

    return comments[:max_count] if max_count > 0 else comments


async def export_forum_channel(
    client: httpx.AsyncClient,
    channel_id: str,
    guild_id: str,
    auth: str,
    max_messages: int,
    send: callable,
) -> tuple[int, int, str]:
    threads = await list_forum_threads(client, channel_id, guild_id, auth, send)
    if not threads:
        await send({"type": "log", "message": "No threads found in this forum."})
        return 0, 0, ""

    per_thread = max_messages if max_messages > 0 else 5000
    total_msgs = 0
    total_blocks = 0
    all_content = []

    for i, th in enumerate(threads):
        title = th.get("name", "")
        desc = await get_first_message(client, th["id"], auth)
        comments = await get_all_comments(client, th["id"], auth, per_thread)

        block = "------\n"
        block += f"Title: {title}\n"
        block += f"Description: {desc}\n\n" if desc else "Description:\n\n"
        block += "Comments:\n"
        for c in comments:
            block += c + "\n"
        block += "--------\n\n"

        all_content.append(block)
        msg_count = len(comments) + (1 if desc else 0)
        total_msgs += msg_count
        total_blocks += 1

        await send({
            "type": "progress",
            "data": {
                "set": i + 1,
                "messagesFound": msg_count,
                "totalMessages": total_msgs,
                "newContent": [title],
            },
        })
        await asyncio.sleep(0.3)

    await send({"type": "log", "message": f"Forum export completed: {total_blocks} posts, {total_msgs} messages."})
    return total_msgs, total_blocks, "".join(all_content)


async def fetch_batch(
    client: httpx.AsyncClient,
    channel_id: str,
    auth: str,
    before_id: str,
) -> tuple[bool, str, int, list[str]]:
    url = f"{DISCORD_API_BASE}/channels/{channel_id}/messages?limit=50"
    if before_id:
        url += f"&before={before_id}"

    resp = await discord_get(client, url, auth)
    try:
        if resp.status_code != 200:
            raise Exception(f"API request failed: {resp.status_code} {resp.text[:200]}")
        messages = resp.json()
    finally:
        await resp.aclose()

    if not messages:
        return False, "", 0, []

    lines = []
    for m in messages:
        line = format_line(m)
        if line:
            lines.append(line)

    return True, messages[-1]["id"], len(lines), lines


async def handle_export(websocket: WebSocket, channel_id: str, auth_token: str, max_messages: int):
    channel_id = channel_id.strip()
    auth = normalize_token(auth_token)

    if not channel_id or not auth:
        await websocket.send_json({"type": "error", "message": "Missing Channel ID or Discord Token"})
        return

    if max_messages < 0:
        max_messages = 0
    unlimited = max_messages <= 0
    max_batches = (max_messages + 49) // 50 if max_messages > 0 else 999999

    download_id = f"{channel_id}-{int(time.time())}"

    async def send(msg: dict):
        try:
            await websocket.send_json(msg)
        except Exception as e:
            logger.warning("WebSocket send error: %s", e)

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        try:
            is_forum, guild_id, channel_name = await get_channel_info(client, channel_id, auth)
        except Exception as e:
            await send({"type": "error", "message": f"Channel lookup failed: {e}"})
            return

        if is_forum:
            await send({"type": "log", "message": "Forum detected — exporting posts (threads)..."})
            try:
                total_msgs, total_blocks, content_str = await export_forum_channel(
                    client, channel_id, guild_id, auth, max_messages, send
                )
            except Exception as e:
                await send({"type": "error", "message": f"Forum export failed: {e}"})
                return

            store.set(download_id, ScrapedContent(content=content_str, timestamp=datetime.now(), channel_id=channel_id, channel_name=channel_name))
            await send({"type": "log", "message": f"Content ready for download ({len(content_str) / 1024:.2f} KB)"})
            await send({
                "type": "complete",
                "data": {
                    "success": True,
                    "totalMessages": total_msgs,
                    "batchesTotal": total_blocks,
                    "downloadId": download_id,
                },
            })
            return

        await send({"type": "log", "message": "Starting content-only scrape..."})
        await send({"type": "log", "message": f"Channel ID: {channel_id}"})

        before_id = ""
        set_num = 1
        total_messages = 0
        batch_lines = []

        while unlimited or set_num <= max_batches:
            batch_msg = f"Fetching batch {set_num}/{max_batches}" if not unlimited else f"Fetching batch {set_num} (all)"
            await send({"type": "log", "message": batch_msg})

            try:
                has_more, new_before, count, new_content = await fetch_batch(client, channel_id, auth, before_id)
            except Exception as e:
                await send({"type": "error", "message": f"Error in batch {set_num}: {e}"})
                break

            if not has_more:
                await send({"type": "log", "message": "No more messages to fetch"})
                break

            total_messages += count
            before_id = new_before
            await send({"type": "log", "message": f"Set {set_num}: Saved {count} lines"})

            chronological = list(reversed(new_content))
            if chronological:
                batch_lines.append(chronological)

            await send({
                "type": "progress",
                "data": {
                    "set": set_num,
                    "messagesFound": count,
                    "totalMessages": total_messages,
                    "newContent": chronological,
                },
            })
            set_num += 1

            if unlimited or set_num <= max_batches:
                base_delay = 0.8 + random.random() * 1.4
                await send({"type": "log", "message": f"Pausing briefly ({base_delay:.1f}s) to respect rate limits..."})
                await asyncio.sleep(base_delay)

                if (set_num - 1) % 10 == 0:
                    long_delay = 3 + random.random() * 3
                    await send({"type": "log", "message": f"Taking a longer break ({long_delay:.1f}s) to mimic human behavior..."})
                    await asyncio.sleep(long_delay)

        await send({"type": "log", "message": "Export completed!"})
        await send({"type": "log", "message": f"Total messages exported: {total_messages}"})
        await send({"type": "log", "message": f"Batches processed: {set_num - 1}"})

        out_parts = []
        for batch in reversed(batch_lines):
            for line in batch:
                out_parts.append(line)
                out_parts.append("\n")
        content_str = "".join(out_parts)

        store.set(download_id, ScrapedContent(content=content_str, timestamp=datetime.now(), channel_id=channel_id, channel_name=channel_name))
        await send({"type": "log", "message": f"Content ready for download ({len(content_str) / 1024:.2f} KB)"})
        await send({
            "type": "complete",
            "data": {
                "success": True,
                "totalMessages": total_messages,
                "batchesTotal": set_num - 1,
                "downloadId": download_id,
            },
        })


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/download/{download_id}")
async def download(download_id: str):
    if not download_id:
        return PlainTextResponse("Download ID required", status_code=400)

    content = store.get(download_id)
    if not content:
        return PlainTextResponse("Download not found or expired", status_code=404)

    safe_name = _sanitize_filename(content.channel_name) if content.channel_name else f"channel-{content.channel_id}"
    filename = f"{safe_name}.txt"
    store.delete(download_id)
    logger.info("Download completed: %s (%.2f KB)", filename, len(content.content) / 1024)

    return PlainTextResponse(
        content.content,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Channel-ID": content.channel_id,
        },
    )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_json({"type": "connected", "message": "Connected to Websocket [Backend]"})
    logger.info("Client connected")

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            if action == "export":
                channel_id = data.get("channelId", "").strip()
                token = data.get("discordToken", "")
                max_msg = data.get("maxMessages", 0)
                if isinstance(max_msg, str):
                    try:
                        max_msg = int(max_msg)
                    except ValueError:
                        max_msg = 0
                asyncio.create_task(handle_export(websocket, channel_id, token, max_msg))
    except WebSocketDisconnect:
        logger.debug("Client disconnected")
    except Exception as e:
        logger.warning("WebSocket error: %s", e)