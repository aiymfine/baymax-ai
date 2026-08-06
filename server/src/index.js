// ─────────────────────────────────────────────────
// Baymax Server — Entry Point
// ─────────────────────────────────────────────────

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { initDb } = require('./db/schema');
const ollama = require('./services/ollama');

const PORT = process.env.PORT || 3200;

const app = express();

// ── CORS ────────────────────────────────────────
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
  : null; // null = allow all (dev mode)
app.use(cors(corsOrigins ? { origin: corsOrigins } : undefined));

// ── Middleware ──────────────────────────────────
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// ── API Key Auth (optional) ─────────────────────
const API_KEY = process.env.API_KEY;
if (API_KEY) {
  app.use('/api/', (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${API_KEY}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });
  console.log('[Baymax] API key authentication enabled.');
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  message: { error: 'Too many requests. Slow down.' },
});
app.use('/api/', limiter);

// ── Routes ───────────────────────────────────────
app.use('/api/chat', require('./routes/chat'));
app.use('/api/memory', require('./routes/memory'));
app.use('/api/personas', require('./routes/persona'));
app.use('/api/checkins', require('./routes/checkin'));
app.use('/api/mood', require('./routes/mood'));
app.use('/api/tools', require('./routes/tools'));
app.use('/api/emotion', require('./routes/emotion'));

// ── Health Check ────────────────────────────────
app.get('/api/health', async (req, res) => {
  const ollamaStatus = await ollama.checkHealth();
  res.json({
    status: 'ok',
    version: '2.1.0',
    ollama: ollamaStatus,
    timestamp: new Date().toISOString(),
  });
});

// ── Start ───────────────────────────────────────
async function start() {
  // Initialize database
  console.log('[Baymax] Initializing database...');
  await initDb();
  const { startAutoSave } = require('./db/schema');
  startAutoSave();
  console.log('[Baymax] Database ready.');

  // Check Ollama
  console.log('[Baymax] Checking Ollama connection...');
  const ollamaStatus = await ollama.checkHealth();
  if (ollamaStatus.ok) {
    console.log(`[Baymax] Ollama connected. Available models: ${ollamaStatus.models.join(', ') || 'none'}`);
    console.log(`[Baymax] Using chat model: ${process.env.OLLAMA_CHAT_MODEL || 'llama3.1'}`);
    console.log(`[Baymax] Using embed model: ${process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'}`);
  } else {
    console.warn(`[Baymax] ⚠️ Ollama not reachable at ${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}`);
    console.warn('[Baymax] Chat and memory features will not work until Ollama is running.');
    console.warn('[Baymax] Install: https://ollama.com — then run: ollama pull llama3.1 && ollama pull nomic-embed-text');
  }

  app.listen(PORT, () => {
    console.log('');
    console.log('  ╔═══════════════════════════════════════╗');
    console.log('  ║          🔐 Baymax v2.1.0             ║');
    console.log(`  ║     Server running on port ${PORT}        ║`);
    console.log('  ║     Tools: shell, file, http, system  ║');
    console.log('  ║     Emotions: 10 moods + spontaneous  ║');
    console.log('  ╚═══════════════════════════════════════╝');
    console.log('');

    // Daily summary check (every hour)
    const { generateDailySummary } = require('./services/extractor');
    const { getDb } = require('./db/schema');
    setInterval(async () => {
      try {
        const { checkHealth } = require('./services/ollama');
        const status = await checkHealth();
        if (status.ok) {
          await generateDailySummary(getDb());
        }
      } catch (e) {
        // Silent fail — don't spam logs
      }
    }, 3600_000); // 1 hour
    // Also try after 30 seconds on startup
    setTimeout(async () => {
      try {
        const status = await ollama.checkHealth();
        if (status.ok) await generateDailySummary(getDb());
      } catch {}
    }, 30_000);

    // ── Proactive Check-In Scheduler ────────────────
    // Generates a check-in message every ~4 hours if appropriate
    const { generateCheckIn } = require('./services/checkin');
    const checkInInterval = 4 * 3600_000; // 4 hours
    let checkInTimer = null;

    const scheduleNextCheckIn = (delay) => {
      if (checkInTimer) clearTimeout(checkInTimer);
      checkInTimer = setTimeout(async () => {
        try {
          const status = await ollama.checkHealth();
          if (status.ok) {
            const result = await generateCheckIn('bestie');
            console.log(result ? `[CheckIn] Sent: "${result.message.slice(0, 50)}..."` : '[CheckIn] Skipped (too soon or inactive)');
          }
        } catch (e) {
          console.error('[CheckIn] Scheduler error:', e.message);
        }
        scheduleNextCheckIn(checkInInterval);
      }, delay);
    };

    // First check-in attempt after 2 minutes, then every 4 hours
    scheduleNextCheckIn(120_000);
    console.log('[Baymax] Check-in scheduler started (every 4h).');

    // ── Spontaneous Message Scheduler ────────────────
    // Baymax sends random thoughts, memory callbacks, vibe checks
    // Checks every 20 minutes, but only sends if probability conditions are met
    const { maybeSendSpontaneous } = require('./services/spontaneous');
    const spontaneousInterval = 20 * 60_000; // 20 minutes
    
    const spontaneousTimer = setInterval(async () => {
      try {
        const status = await ollama.checkHealth();
        if (status.ok) {
          const result = await maybeSendSpontaneous();
          if (result) {
            console.log(`[Spontaneous] Sent (${result.type}): "${result.message.slice(0, 50)}..."`);
          }
        }
      } catch (e) {
        // Silent fail
      }
    }, spontaneousInterval);
    
    // First check after 5 minutes (let things warm up)
    setTimeout(async () => {
      try {
        const status = await ollama.checkHealth();
        if (status.ok) {
          const result = await maybeSendSpontaneous();
          if (result) console.log(`[Spontaneous] Initial: "${result.message.slice(0, 50)}..."`);
        }
      } catch {}
    }, 300_000);

    console.log('[Baymax] Spontaneous thought engine started (checks every 20min).');
  });
}

start().catch((err) => {
  console.error('[Baymax] Fatal error:', err);
  process.exit(1);
});

// ── Graceful Shutdown ───────────────────────────
function shutdown(signal) {
  console.log(`\n[Baymax] ${signal} received. Saving database...`);
  try {
    const { saveDb } = require('./db/schema');
    saveDb();
    console.log('[Baymax] Database saved. Goodbye! 👋');
  } catch (e) {
    console.error('[Baymax] Save on shutdown failed:', e.message);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
