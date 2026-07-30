// ─────────────────────────────────────────────────
// Check-In Routes — Proactive AI messages
// ─────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { getDb } = require('../db/schema');
const checkin = require('../services/checkin');

/**
 * GET /api/checkins — Get unread check-ins
 * Query: ?limit=5
 */
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const checkIns = checkin.getUnreadCheckIns(limit);
    res.json(checkIns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/checkins/recent — Get all recent check-ins
 */
router.get('/recent', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const checkIns = checkin.getRecentCheckIns(limit);
    res.json(checkIns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/checkins/:id/read — Mark as read
 */
router.post('/:id/read', (req, res) => {
  try {
    checkin.markRead(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/checkins/:id/dismiss — Dismiss
 */
router.post('/:id/dismiss', (req, res) => {
  try {
    checkin.dismiss(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/checkins/generate — Manually trigger check-in generation
 * Body: { persona? }
 */
router.post('/generate', async (req, res) => {
  try {
    const { persona } = req.body;
    const result = await checkin.generateCheckIn(persona);
    if (result) {
      res.json(result);
    } else {
      res.json({ skipped: true, reason: 'Too soon or user inactive' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
