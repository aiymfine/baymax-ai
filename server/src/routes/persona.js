// ─────────────────────────────────────────────────
// Persona Routes — List and manage personas
// ─────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { getDb } = require('../db/schema');

/**
 * GET /api/personas — List all personas
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const personas = db.prepare(
      'SELECT name, display_name, description, emoji, is_default FROM personas ORDER BY is_default DESC, name ASC'
    ).all();
    res.json(personas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/personas — Create a custom persona
 * Body: { name, displayName, description, systemPrompt, emoji }
 */
router.post('/', (req, res) => {
  try {
    const { name, displayName, description, systemPrompt, emoji } = req.body;

    if (!name || !displayName || !systemPrompt) {
      return res.status(400).json({ error: 'name, displayName, and systemPrompt are required' });
    }

    const db = getDb();

    // Check if name already exists
    const existing = db.prepare('SELECT id FROM personas WHERE name = ?').get(name.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'Persona with this name already exists' });
    }

    db.prepare(
      'INSERT INTO personas (name, display_name, description, system_prompt, emoji) VALUES (?, ?, ?, ?, ?)'
    ).run(name.toLowerCase().replace(/\s+/g, '-'), displayName, description, systemPrompt, emoji || '✨');

    res.status(201).json({ ok: true, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/personas/:name — Delete a custom persona (not defaults)
 */
router.delete('/:name', (req, res) => {
  try {
    const db = getDb();
    const persona = db.prepare('SELECT is_default FROM personas WHERE name = ?').get(req.params.name);
    if (!persona) return res.status(404).json({ error: 'Persona not found' });
    if (persona.is_default) {
      return res.status(403).json({ error: 'Cannot delete default personas' });
    }
    db.prepare('DELETE FROM personas WHERE name = ?').run(req.params.name);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
