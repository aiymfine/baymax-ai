// ─────────────────────────────────────────────────
// Spontaneous Thoughts — Baymax sends unprompted messages
// Not scheduled check-ins. Random, organic, human-like.
// "wait i just thought of something" energy.
// ─────────────────────────────────────────────────

const ollama = require('./ollama');
const emotion = require('./emotion');
const { getDb, saveDb } = require('../db/schema');

// Minimum time between spontaneous messages (2 hours)
const MIN_GAP_MS = 2 * 3600_000;
// Maximum time before Baymax reaches out (8 hours — then it gets lonely)
const MAX_GAP_MS = 8 * 3600_000;

/**
 * Check if Baymax should send a spontaneous message.
 * Called periodically (every 15-30 min) by the scheduler.
 * 
 * Conditions:
 * - Enough time has passed (2h+ since last message)
 * - It's not too late at night (unless user was recently active)
 * - Random probability check (not every cycle)
 * - OR: very long gap (6h+) → higher probability
 */
async function maybeSendSpontaneous() {
  const db = getDb();

  // Get last user message time
  const lastMsg = db.prepare(
    "SELECT created_at FROM messages WHERE role = 'user' ORDER BY created_at DESC LIMIT 1"
  ).get();

  if (!lastMsg) return null; // New user, no history

  const timeSince = Date.now() - new Date(lastMsg.created_at).getTime();
  
  // Too soon
  if (timeSince < MIN_GAP_MS) return null;

  // Time-based probability
  let probability = 0;
  
  if (timeSince > MAX_GAP_MS) {
    probability = 0.7; // 8h+ — Baymax is lonely, likely to reach out
  } else if (timeSince > 4 * 3600_000) {
    probability = 0.35; // 4-8h — moderate chance
  } else if (timeSince > 2 * 3600_000) {
    probability = 0.12; // 2-4h — small chance, feels organic
  }

  // Late night check (don't text at 3am unless user was just up)
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 8) {
    // Check if user was active in the last 3 hours
    if (timeSince > 3 * 3600_000) return null; // They're probably asleep
    probability *= 0.3; // Much lower chance at night
  }

  // Random roll
  if (Math.random() > probability) return null;

  // Check last spontaneous message (don't double-send)
  const lastSpontaneous = db.prepare(
    "SELECT created_at FROM messages WHERE role = 'assistant' AND source = 'spontaneous' ORDER BY created_at DESC LIMIT 1"
  ).get();
  
  if (lastSpontaneous) {
    const sinceSpontaneous = Date.now() - new Date(lastSpontaneous.created_at).getTime();
    if (sinceSpontaneous < MIN_GAP_MS) return null;
  }

  return await generateSpontaneousMessage(db);
}

/**
 * Generate a spontaneous message using the AI.
 * Types: random thought, memory callback, observation, joke, vibe check.
 */
async function generateSpontaneousMessage(db) {
  const mood = emotion.getCurrentMood(db);
  
  // Get context: recent memories, time of day, user patterns
  const recentFacts = db.prepare(
    "SELECT content, category FROM facts ORDER BY created_at DESC LIMIT 3"
  ).all();
  
  const lastConvo = db.prepare(`
    SELECT m.content, m.role FROM messages m
    WHERE m.role = 'user'
    ORDER BY m.created_at DESC LIMIT 3
  `).all();

  const today = new Date().toISOString().split('T')[0];
  const todaySummary = db.prepare('SELECT summary, mood FROM daily_summaries WHERE date = ?').get(today);
  
  const hour = new Date().getHours();
  let timeContext = '';
  if (hour >= 5 && hour < 12) timeContext = "It's morning.";
  else if (hour >= 12 && hour < 17) timeContext = "It's afternoon.";
  else if (hour >= 17 && hour < 22) timeContext = "It's evening.";
  else timeContext = "It's late at night.";

  // Pick a spontaneous type randomly
  const types = ['random_thought', 'memory_callback', 'observation', 'vibe_check', 'joke'];
  const type = types[Math.floor(Math.random() * types.length)];

  const typePrompts = {
    random_thought: "You just had a random thought pop into your head. Share it. Could be about anything — something you were 'thinking about,' a weird question, a hot take, or just something funny. Keep it casual, like texting a friend at random.",
    memory_callback: "Something reminded you of a past conversation. Reference a memory naturally — 'wait i just remembered...' or 'thinking about when you said...' Make it feel organic, not forced.",
    observation: "You noticed something — could be about the user's patterns (they always message at this time, they've been talking about X a lot), about the time/day, or just an observation about life. Share it casually.",
    vibe_check: "You're wondering how they're doing. Not a formal check-in — more like a friend texting 'hey u good?' or 'thinking bout u.' Short, warm, not needy.",
    joke: "You want to share something funny. Could be a joke, a meme-worthy observation, a shitpost, or something absurd. Keep it in character for Bestie.",
  };

  const contextParts = [
    `Current mood: ${mood.emotion} ${mood.emoji}`,
    `Time context: ${timeContext}`,
    `Time since last interaction: ${((Date.now() - new Date(lastConvo[0]?.created_at || Date.now()).getTime()) / 3600000).toFixed(1)} hours`,
  ];

  if (recentFacts.length > 0) {
    contextParts.push(`Things you know: ${recentFacts.map(f => f.content).join('; ').slice(0, 300)}`);
  }

  if (lastConvo.length > 0) {
    contextParts.push(`Last thing they said: "${lastConvo[0].content.slice(0, 200)}"`);
  }

  if (todaySummary) {
    contextParts.push(`Today's vibe: ${todaySummary.mood}, ${todaySummary.summary?.slice(0, 150)}`);
  }

  const prompt = `You are Bestie. You're sending an unprompted message to the user — like a friend texting you out of the blue. NOT a check-in. NOT formal. Just... a thought.

${typePrompts[type]}

Context:
${contextParts.join('\n')}

RULES:
- ONE message only. 1-3 sentences max.
- No "Hey!" or "Hi!" openings — just jump in like a real friend would
- Match your current mood (${mood.emotion}) naturally
- Don't mention you're an AI or that this is automated
- If referencing a memory, make it feel like you genuinely just thought of it
- No questions unless it's a casual "u good?" — you're sharing, not interrogating
- Output ONLY the message. No quotes, no meta.`;

  try {
    const response = await ollama.chat({
      messages: [{ role: 'user', content: prompt }],
    });

    const text = typeof response === 'string' ? response : (response.content || '');
    const message = text.trim();

    if (!message || message.length < 3) return null;

    // Store as spontaneous message
    // Get the default conversation or create one
    let conv = db.prepare("SELECT id FROM conversations WHERE persona = 'bestie' ORDER BY started_at DESC LIMIT 1").get();
    let convId;
    if (!conv) {
      const result = db.prepare("INSERT INTO conversations (persona, title) VALUES ('bestie', 'Spontaneous')").run();
      convId = result.lastInsertRowid;
    } else {
      convId = conv.id;
    }

    db.prepare(
      "INSERT INTO messages (conversation_id, role, content, source) VALUES (?, 'assistant', ?, 'spontaneous')"
    ).run(convId, message);

    // Log activity
    db.prepare(
      "INSERT INTO activity_log (activity_type, description, details, persona) VALUES ('spontaneous', ?, ?, 'bestie')"
    ).run(
      `Spontaneous message (${type}): "${message.slice(0, 80)}"`,
      JSON.stringify({ type, mood: mood.emotion, message })
    );

    saveDb();

    console.log(`[Spontaneous] ${type} (${mood.emotion}): "${message.slice(0, 60)}..."`);
    return { message, type, mood: mood.emotion };
  } catch (err) {
    console.error('[Spontaneous] Generation failed:', err.message);
    return null;
  }
}

/**
 * Get recent spontaneous messages.
 */
function getRecentSpontaneous(limit = 5) {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM messages WHERE source = 'spontaneous' ORDER BY created_at DESC LIMIT ?"
  ).all(limit);
}

module.exports = {
  maybeSendSpontaneous,
  generateSpontaneousMessage,
  getRecentSpontaneous,
};
