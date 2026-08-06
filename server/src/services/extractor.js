// ─────────────────────────────────────────────────
// Fact Extractor — Pulls structured facts from conversations
// ─────────────────────────────────────────────────

const ollama = require('./ollama');
const embeddings = require('./embeddings');
const { getDb, saveDb } = require('../db/schema');

const EXTRACTION_PROMPT = `Analyze this conversation and extract structured facts about the user. Be precise and factual.

Categories:
- fact: objective information about the user (birthday, job, location, education)
- preference: things the user likes or dislikes (food, music, activities)
- opinion: the user's views on topics or people (beliefs, judgments)
- person: information about someone the user mentioned (name, relationship, details)
- relationship: how the user relates to someone (dynamic, history, feelings)
- event: something that happened or will happen (past event, future plan, milestone)

For each fact extracted, return a JSON object with:
- content: the fact as a clear statement
- category: one of the categories above
- person_name: (only for 'person' and 'relationship' categories) the name of the person
- confidence: 0.0 to 1.0 (how certain you are this is accurate)

Return ONLY a JSON array. No explanation, no markdown, no extra text. If no facts can be extracted, return [].

Example output:
[
  {"content": "User's birthday is March 15", "category": "fact", "person_name": null, "confidence": 0.95},
  {"content": "User dislikes waking up early", "category": "preference", "person_name": null, "confidence": 0.8},
  {"content": "Z is a classmate who is lazy but funny", "category": "person", "person_name": "Z", "confidence": 0.7}
]`;

/**
 * Extract facts from a conversation message using the LLM.
 */
async function extractFacts(messageContent, role = 'user') {
  try {
    const prompt = `${EXTRACTION_PROMPT}\n\nConversation message (${role}):\n"${messageContent}"`;

    const response = await ollama.chat({
      messages: [{ role: 'user', content: prompt }],
    });

    const text = typeof response === 'string' ? response : (response.content || '');
    const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const facts = JSON.parse(cleaned);

    if (!Array.isArray(facts)) return [];

    return facts
      .filter((f) => f.content && f.category)
      .map((f) => ({
        content: String(f.content).trim(),
        category: f.category.trim().toLowerCase(),
        person_name: f.person_name ? String(f.person_name).trim() : null,
        confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0.8)),
      }));
  } catch (err) {
    console.error('[Extractor] Failed to extract facts:', err.message);
    return [];
  }
}

/**
 * Extract facts from a message, compute embeddings, and store in DB.
 */
async function processAndStoreFacts(db, messageContent, messageId) {
  const facts = await extractFacts(messageContent);

  if (facts.length === 0) return [];

  const results = [];
  for (const fact of facts) {
    // Track people
    if (fact.person_name) {
      try {
        db.run(
          `INSERT INTO people (name, last_seen, mention_count)
           VALUES (?, datetime('now'), 1)
           ON CONFLICT(name) DO UPDATE SET last_seen = datetime('now'), mention_count = mention_count + 1`,
          [fact.person_name]
        );
      } catch (e) {
        // Ignore constraint errors
      }
    }

    // Insert fact (without embedding initially)
    const result = db.run(
      'INSERT INTO facts (content, category, person_name, confidence, source_message_id) VALUES (?, ?, ?, ?, ?)',
      [fact.content, fact.category, fact.person_name, fact.confidence, messageId]
    );

    results.push({ ...fact, id: result.lastInsertRowid });
  }

  // Save DB to disk
  saveDb();

  // Compute embeddings in background
  setImmediate(async () => {
    try {
      for (const fact of results) {
        const vec = await embeddings.getEmbedding(fact.content);
        if (vec) {
          db.run('UPDATE facts SET embedding = ? WHERE id = ?', [embeddings.pack(vec), fact.id]);
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      saveDb();
      console.log(`[Extractor] Computed embeddings for ${results.length} facts`);
    } catch (err) {
      console.error('[Extractor] Embedding computation failed:', err.message);
    }
  });

  return results;
}

/**
 * Update user profile summary based on all stored facts.
 */
async function updateUserProfile(db) {
  try {
    const facts = db.prepare('SELECT content, category FROM facts WHERE category IN (\'fact\', \'preference\')').all();
    if (facts.length === 0) return;

    const factList = facts.map((f) => `[${f.category}] ${f.content}`).join('\n');

    const response = await ollama.chat({
      messages: [{
        role: 'user',
        content: `Based on these facts about the user, write a concise natural-language summary (3-5 sentences) that captures who this person is. Write it as if describing the user to someone who doesn't know them. Be warm but factual.\n\nFacts:\n${factList}`,
      }],
    });

    const profileText = typeof response === 'string' ? response : (response.content || '');
    db.run('UPDATE user_profile SET summary = ?, updated_at = datetime(\'now\') WHERE id = 1', [profileText]);
    saveDb();
  } catch (err) {
    console.error('[Extractor] Profile update failed:', err.message);
  }
}

/**
 * Generate a daily summary from the day's messages.
 */
async function generateDailySummary(db) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Check if already generated
    const existing = db.prepare('SELECT id FROM daily_summaries WHERE date = ?').get(today);
    if (existing) return;

    // Get today's messages
    const messages = db.prepare(
      `SELECT m.content, m.role, m.created_at
       FROM messages m
       WHERE DATE(m.created_at) = ?
       ORDER BY m.created_at ASC`
    ).all(today);

    if (messages.length < 5) return; // Not enough conversation to summarize

    const transcript = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Baymax'}: ${m.content}`)
      .join('\n');

    const response = await ollama.chat({
      messages: [{
        role: 'user',
        content: `Summarize today's conversation between the user and Baymax. Write a concise summary (2-3 sentences) of what was discussed. Also identify the user's overall mood today (one word: happy, sad, neutral, anxious, excited, frustrated, calm). And list 1-3 main topics.\n\nFormat your response as JSON:\n{"summary": "...", "mood": "...", "topics": ["topic1", "topic2"]}\n\nConversation:\n${transcript}`,
      }],
    });

    const text = typeof response === 'string' ? response : (response.content || '');
    const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    db.run(
      `INSERT OR REPLACE INTO daily_summaries (date, summary, mood, topics, message_count)
       VALUES (?, ?, ?, ?, ?)`,
      [today, parsed.summary || '', parsed.mood || 'unknown',
       JSON.stringify(parsed.topics || []), messages.length]
    );
    saveDb();
    console.log(`[Extractor] Daily summary generated for ${today}: ${parsed.mood}`);
  } catch (err) {
    console.error('[Extractor] Daily summary failed:', err.message);
  }
}

module.exports = { extractFacts, processAndStoreFacts, updateUserProfile, generateDailySummary };
