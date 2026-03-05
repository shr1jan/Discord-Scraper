/*
 Sequential Discord channel scraper using the Python WebSocket backend.
 Sends one export per channel over WS, waits for complete, downloads as <channelName>.txt.
 Sleeps 20 seconds between channels to respect rate limits.
*/

/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { setTimeout: sleep } = require('timers/promises');
const WebSocket = require('ws');

// Load env from frontend/.env.local or fallback to frontend/.env
try {
  // Prefer .env.local if available
  const envLocalPath = path.resolve(__dirname, '..', '.env.local');
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envLocalPath)) {
    require('dotenv').config({ path: envLocalPath });
  } else if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  } else {
    require('dotenv').config();
  }
} catch (e) {
  // noop
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';
const DOWNLOAD_BASE_URL = process.env.NEXT_PUBLIC_DOWNLOAD_URL || 'http://localhost:8000';
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN || '';

if (!DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN in environment. Add it to frontend/.env.local');
  process.exit(1);
}

const channels = {
  general: 'YOUR_CHANNEL_ID_HERE',
};

const OUTPUT_DIR = path.resolve(__dirname, '..', 'exports');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function exportSingleChannel(channelName, channelId, token) {
  const ws = new WebSocket(WS_URL);

  const downloadId = await new Promise((resolve, reject) => {
    let settled = false;
    const timeoutMs = 10 * 60 * 1000; // 10 minutes per channel
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch (_) {}
        reject(new Error(`Timeout while exporting ${channelName}`));
      }
    }, timeoutMs);

    ws.on('open', () => {
      console.log(`[${channelName}] Connected to WS. Starting export...`);
      const message = {
        action: 'export',
        channelId: channelId,
        discordToken: token,
        maxMessages: 0, // 0 = entire channel
      };
      ws.send(JSON.stringify(message));
    });

    ws.on('message', (data) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.type === 'error') {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            try { ws.close(); } catch (_) {}
            reject(new Error(payload.message || 'Unknown backend error'));
          }
        } else if (payload.type === 'complete' && payload.data && payload.data.downloadId) {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            try { ws.close(); } catch (_) {}
            resolve(payload.data.downloadId);
          }
        }
      } catch (err) {
        // ignore non-JSON
      }
    });

    ws.on('close', () => {
      // no-op
    });
    ws.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
  });

  console.log(`[${channelName}] Export complete. Download ID: ${downloadId}`);
  const downloadUrl = `${DOWNLOAD_BASE_URL}/download/${downloadId}`;
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`[${channelName}] Download failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  const outPath = path.join(OUTPUT_DIR, `${channelName}.txt`);
  fs.writeFileSync(outPath, text, 'utf8');
  console.log(`[${channelName}] Saved -> ${path.relative(process.cwd(), outPath)} (${Buffer.byteLength(text, 'utf8')} bytes)`);
}

(async () => {
  console.log(`Backend WS: ${WS_URL}`);
  console.log(`Download base: ${DOWNLOAD_BASE_URL}`);
  for (const [name, id] of Object.entries(channels)) {
    console.log(`\n=== Processing channel: ${name} (${id}) ===`);
    try {
      await exportSingleChannel(name, id, DISCORD_TOKEN);
    } catch (err) {
      console.error(`[${name}] Failed:`, err.message);
    }
    console.log(`[${name}] Waiting 20s before next channel...`);
    await sleep(20_000);
  }
  console.log('\nAll channels processed.');
})().catch((err) => {
  console.error('Batch failed:', err);
  process.exit(1);
});


