// ─────────────────────────────────────────────────
// Activity Tracker — Knows what was happening recently
// Enables "we stopped at..." session resume
// ─────────────────────────────────────────────────

const { getDb } = require('../db/schema');
const os = require('os');

/**
 * Log a tool execution to the activity table.
 * This is what powers the "where did we stop?" feature.
 */
function logActivity(db, entry) {
  try {
    db.prepare(
      `INSERT INTO activity_log (activity_type, description, details, persona)
       VALUES (?, ?, ?, ?)`
    ).run(
      entry.type || 'tool',
      entry.description || '',
      JSON.stringify(entry.details || {}),
      entry.persona || 'null'
    );
  } catch (err) {
    // Non-blocking — activity logging should never break execution
    console.error('[Activity] Log error:', err.message);
  }
}

/**
 * Get recent activity for session resume.
 * Returns the last N meaningful things that happened.
 */
function getRecentActivity(db, limit = 10) {
  try {
    return db.prepare(
      `SELECT * FROM activity_log
       ORDER BY created_at DESC
       LIMIT ?`
    ).all(limit);
  } catch {
    return [];
  }
}

/**
 * Get a human-readable summary of what was happening last.
 * Used for boot greeting: "Yo, we were pentesting X yesterday..."
 */
function getSessionResumeSummary(db) {
  const activities = getRecentActivity(db, 5);
  if (activities.length === 0) return null;

  const last = activities[0];
  const details = typeof last.details === 'string' ? JSON.parse(last.details) : last.details;

  // Time since last activity
  const lastTime = new Date(last.created_at);
  const now = new Date();
  const hoursAgo = Math.round((now - lastTime) / 3600000);

  let timeStr;
  if (hoursAgo < 1) timeStr = 'less than an hour ago';
  else if (hoursAgo < 24) timeStr = `${hoursAgo} hours ago`;
  else timeStr = `${Math.round(hoursAgo / 24)} days ago`;

  return {
    lastActivity: {
      type: last.activity_type,
      description: last.description,
      details,
      persona: last.persona,
      time: timeStr,
      timestamp: last.created_at,
    },
    recentActivities: activities.slice(0, 5).map((a) => ({
      type: a.activity_type,
      description: a.description,
      time: a.created_at,
    })),
  };
}

/**
 * Build a context string for the LLM so it knows what was happening.
 */
function buildActivityContext(db) {
  const summary = getSessionResumeSummary(db);
  if (!summary) return '';

  const parts = ['## Recent Activity (Session Context)'];

  parts.push(`Last action (${summary.lastActivity.time}): ${summary.lastActivity.description}`);

  if (summary.recentActivities.length > 1) {
    parts.push('\nRecent actions:');
    for (const a of summary.recentActivities.slice(0, 5)) {
      parts.push(`- ${a.description}`);
    }
  }

  return parts.join('\n');
}

module.exports = {
  logActivity,
  getRecentActivity,
  getSessionResumeSummary,
  buildActivityContext,
};
