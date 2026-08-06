// ─────────────────────────────────────────────────
// Check-In Service — Proactive messages from the AI
// ─────────────────────────────────────────────────

const ollama = require('./ollama');
const { getDb, saveDb } = require('../db/schema');

const TIMEBLOCKS = {
  morning: { start: 8, end: 12, greeting: 'morning' },
  afternoon: { start: 12, end: 17, greeting: 'afternoon' },
  evening: { start: 17, end: 22, greeting: 'evening' },
  night: { start: 22, end: 4, greeting: 'late night' },
};

/**
 * Determine current time block based on hour.
 */
function getCurrentTimeBlock() {
  const hour = new Date().getHours();
  for (const [name, block] of Object.entries(TIMEBLOCKS)) {
    if (name === 'night') {
      if (hour >= 22 || hour < 4) return name;
    } else {
      if (hour >= block.start && hour < block.end) return name;
    }
  }
  return 'morning';
}

/**
 * Get recent conversation context for personalization.
 */
function getRecentContext(db) {
  const parts = [];

  // User profile
  const profile = db.prepare('SELECT name, summary FROM user_profile WHERE id = 1').get();
  if (profile?.name) parts.push(`User's name: ${profile.name}`);
  if (profile?.summary) parts.push(`About them: ${profile.summary}`);

  // Last conversation (was it recent?)
  const lastConv = db.prepare(`
    SELECT c.started_at, c.title, m.content, m.role
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    ORDER BY c.started_at DESC, m.created_at DESC
    LIMIT 5
  `).all();

  if (lastConv.length > 0 && lastConv[0].content) {
    const lastTime = new Date(lastConv[0].started_at);
    const hoursAgo = (Date.now() - lastTime.getTime()) / 3600000;
    const recentTopics = lastConv
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .filter(Boolean);
    if (recentTopics.length > 0) {
      parts.push(`Last talked ${hoursAgo.toFixed(0)}h ago about: ${recentTopics.join(' / ').slice(0, 200)}`);
    }
  }

  // Recent facts
  const recentFacts = db.prepare(
    "SELECT content, category FROM facts ORDER BY created_at DESC LIMIT 5"
  ).all();
  if (recentFacts.length > 0) {
    parts.push(`Recent memories: ${recentFacts.map((f) => f.content).join('; ').slice(0, 300)}`);
  }

  // Today's mood
  const today = new Date().toISOString().split('T')[0];
  const todayMood = db.prepare('SELECT mood FROM daily_summaries WHERE date = ?').get(today);
  if (todayMood?.mood) parts.push(`Today's mood so far: ${todayMood.mood}`);

  return parts.join('\n');
}

/**
 * Generate a check-in message using the AI.
 */
async function generateCheckIn(persona = 'bestie') {
  const db = getDb();
  const timeBlock = getCurrentTimeBlock();
  const context = getRecentContext(db);

  // Get persona prompt
  const personaData = db.prepare('SELECT system_prompt FROM personas WHERE name = ?').get(persona);
  const systemPrompt = personaData?.system_prompt || '';

  // Check last check-in time — don't spam
  const lastCheckIn = db.prepare(
    "SELECT created_at FROM check_ins ORDER BY created_at DESC LIMIT 1"
  ).get();
  if (lastCheckIn) {
    const hoursSince = (Date.now() - new Date(lastCheckIn.created_at).getTime()) / 3600000;
    if (hoursSince < 3) return null; // Too soon
  }

  // Don't check in at weird hours unless user was active recently
  const hour = new Date().getHours();
  if (hour < 7 || hour >= 23) {
    const recentActivity = db.prepare(
      "SELECT created_at FROM messages WHERE role = 'user' ORDER BY created_at DESC LIMIT 1"
    ).get();
    if (recentActivity) {
      const hoursSinceLastMsg = (Date.now() - new Date(recentActivity.created_at).getTime()) / 3600000;
      if (hoursSinceLastMsg > 2) return null; // User probably asleep
    } else {
      return null; // No activity at all
    }
  }

  const prompt = `${systemPrompt}

You are sending a proactive check-in message to the user. It's ${timeBlock} time.

Context about the user:
${context || '(no context yet — this might be a new user)'}

Rules:
- Write ONE short message (1-3 sentences max). Like a text from a friend.
- Don't be annoying. Don't ask too many questions. Just a casual check-in.
- Reference something from context if it feels natural, but don't force it.
- Match your persona's vibe exactly.
- If they mentioned something happening today (exam, meeting, date, etc.), ask about it.
- Don't say "I'm checking in" or "Just wanted to check in" — that's robotic. Be natural.
- Output ONLY the message, no quotes, no meta-commentary.`;

  try {
    const message = await ollama.chat({
      messages: [{ role: 'user', content: prompt }],
    });

    const msgText = typeof message === 'string' ? message : (message.content || '');
    const cleaned = msgText.trim();
    if (!cleaned || cleaned.length < 3) return null;

    // Store the check-in
    const result = db.run(
      'INSERT INTO check_ins (persona, message) VALUES (?, ?)',
      [persona, cleaned]
    );
    saveDb();

    console.log(`[CheckIn] Generated (${timeBlock}): ${cleaned.slice(0, 60)}...`);
    return { id: result.lastInsertRowid, message: cleaned, persona, timeBlock };
  } catch (err) {
    console.error('[CheckIn] Generation failed:', err.message);
    return null;
  }
}

/**
 * Get unread check-ins.
 */
function getUnreadCheckIns(limit = 5) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM check_ins WHERE read_at IS NULL AND dismissed_at IS NULL ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
}

/**
 * Get recent check-ins (read or unread).
 */
function getRecentCheckIns(limit = 10) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM check_ins ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
}

/**
 * Mark check-in as read.
 */
function markRead(id) {
  const db = getDb();
  db.run("UPDATE check_ins SET read_at = datetime('now') WHERE id = ?", [id]);
  saveDb();
}

/**
 * Dismiss check-in.
 */
function dismiss(id) {
  const db = getDb();
  db.run("UPDATE check_ins SET dismissed_at = datetime('now') WHERE id = ?", [id]);
  saveDb();
}

module.exports = {
  generateCheckIn,
  getUnreadCheckIns,
  getRecentCheckIns,
  markRead,
  dismiss,
  getCurrentTimeBlock,
};
