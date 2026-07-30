// ─────────────────────────────────────────────────
// Mood Routes — Mood timeline & insights
// ─────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { getDb } = require('../db/schema');

/**
 * GET /api/mood/timeline — Mood over time from daily summaries
 * Query: ?days=30
 */
router.get('/timeline', (req, res) => {
  try {
    const db = getDb();
    const days = parseInt(req.query.days) || 30;
    const timeline = db.prepare(`
      SELECT date, mood, summary, topics, message_count
      FROM daily_summaries
      ORDER BY date DESC
      LIMIT ?
    `).all(days);
    res.json(timeline);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/mood/insights — AI-generated mood insights
 */
router.get('/insights', async (req, res) => {
  try {
    const db = getDb();
    const summaries = db.prepare(`
      SELECT date, mood, summary, topics, message_count
      FROM daily_summaries
      WHERE mood IS NOT NULL AND mood != ''
      ORDER BY date DESC
      LIMIT 14
    `).all(14);

    if (summaries.length < 3) {
      return res.json({
        insights: "Not enough data yet. Chat with me for a few days and I'll start seeing patterns in your mood! 📊",
        moodCounts: {},
        total: summaries.length,
      });
    }

    // Count mood frequencies
    const moodCounts = {};
    for (const s of summaries) {
      const mood = (s.mood || 'unknown').toLowerCase();
      moodCounts[mood] = (moodCounts[mood] || 0) + 1;
    }

    // Generate insight using Ollama
    const ollama = require('../services/ollama');
    const dataStr = summaries
      .map((s) => `${s.date}: ${s.mood} (${s.message_count} msgs) — ${s.summary || 'no summary'}`)
      .join('\n');

    const response = await ollama.chat({
      messages: [{
        role: 'user',
        content: `Analyze these daily mood logs and write a short, friendly insight (2-3 sentences). Notice patterns, trends, or something interesting. Be casual and warm, like a friend who pays attention.

Data:
${dataStr}

Write the insight directly, no preamble. Make it feel personal and specific to the data.`,
      }],
    });

    res.json({
      insights: response,
      moodCounts,
      total: summaries.length,
      mostFrequentMood: Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/mood/stats — Mood distribution stats
 */
router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const days = parseInt(req.query.days) || 30;

    const distribution = db.prepare(`
      SELECT mood, COUNT(*) as count
      FROM daily_summaries
      WHERE mood IS NOT NULL AND mood != ''
      AND date >= date('now', '-${days} days')
      GROUP BY mood
      ORDER BY count DESC
    `).all();

    const streak = db.prepare(`
      SELECT date, mood
      FROM daily_summaries
      WHERE mood IS NOT NULL
      ORDER BY date DESC
      LIMIT 7
    `).all();

    const totalDays = db.prepare(`
      SELECT COUNT(DISTINCT date) as c
      FROM daily_summaries
      WHERE date >= date('now', '-${days} days')
    `).get().c;

    res.json({ distribution, recentStreak: streak, totalDays });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
