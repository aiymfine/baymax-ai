// ─────────────────────────────────────────────────
// Memory Routes — Browse facts, people, profile
// ─────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { getDb } = require('../db/schema');
const memory = require('../services/memory');

/**
 * GET /api/memory/facts — List facts with optional filters
 * Query: category, personName, limit, offset
 */
router.get('/facts', (req, res) => {
  try {
    const db = getDb();
    const facts = memory.getFacts(db, {
      category: req.query.category || null,
      personName: req.query.personName || null,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
    });
    res.json(facts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/memory/facts/:id — Delete a specific fact
 */
router.delete('/facts/:id', (req, res) => {
  try {
    const db = getDb();
    const result = memory.deleteFact(db, req.params.id);
    res.json({ ok: true, deleted: result.changes > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/memory/people — List all known people
 */
router.get('/people', (req, res) => {
  try {
    const db = getDb();
    const people = memory.getPeople(db);
    res.json(people);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/memory/profile — Get user profile
 */
router.get('/profile', (req, res) => {
  try {
    const db = getDb();
    const profile = db.prepare('SELECT * FROM user_profile WHERE id = 1').get();
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/memory/profile — Update user profile (name only for now)
 */
router.put('/profile', (req, res) => {
  try {
    const db = getDb();
    const { name } = req.body;
    if (name) {
      db.prepare('UPDATE user_profile SET name = ?, updated_at = datetime(\'now\') WHERE id = 1').run(name);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/memory/stats — Memory statistics
 */
router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const stats = {
      totalFacts: db.prepare('SELECT COUNT(*) as c FROM facts').get().c,
      totalPeople: db.prepare('SELECT COUNT(*) as c FROM people').get().c,
      totalConversations: db.prepare('SELECT COUNT(*) as c FROM conversations').get().c,
      totalMessages: db.prepare('SELECT COUNT(*) as c FROM messages').get().c,
      factsByCategory: db.prepare(
        'SELECT category, COUNT(*) as count FROM facts GROUP BY category'
      ).all(),
      recentActivity: db.prepare(
        'SELECT DATE(created_at) as date, COUNT(*) as count FROM messages GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 7'
      ).all(),
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
