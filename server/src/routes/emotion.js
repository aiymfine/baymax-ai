// ─────────────────────────────────────────────────
// Emotion Routes — Baymax's feelings
// ─────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { getDb } = require('../db/schema');
const emotion = require('../services/emotion');
const spontaneous = require('../services/spontaneous');

/**
 * GET /api/emotion — Get Baymax's current mood
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const mood = emotion.getMoodInfo(db);
    res.json(mood);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/emotion/context — Get mood context string (for debugging)
 */
router.get('/context', (req, res) => {
  try {
    const db = getDb();
    const context = emotion.getMoodContext(db);
    res.json({ context });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/emotion/set — Manually set Baymax's mood
 * Body: { emotion: 'happy', reason: 'user said something nice' }
 */
router.post('/set', (req, res) => {
  try {
    const db = getDb();
    const { emotion: emo, reason = 'manual override' } = req.body;
    
    if (!emo || !emotion.EMOTIONS[emo]) {
      return res.status(400).json({ 
        error: `Invalid emotion. Available: ${Object.keys(emotion.EMOTIONS).join(', ')}` 
      });
    }

    const mood = emotion.setMood(db, emo, reason);
    res.json(mood);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/emotion/types — List all possible emotions
 */
router.get('/types', (req, res) => {
  res.json(emotion.EMOTIONS);
});

/**
 * GET /api/emotion/spontaneous — Get recent spontaneous messages
 */
router.get('/spontaneous', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);
    const messages = spontaneous.getRecentSpontaneous(limit);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/emotion/spontaneous/trigger — Manually trigger a spontaneous message check
 */
router.post('/spontaneous/trigger', async (req, res) => {
  try {
    const result = await spontaneous.maybeSendSpontaneous();
    res.json({ sent: !!result, message: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
