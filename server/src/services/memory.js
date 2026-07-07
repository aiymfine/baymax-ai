// ─────────────────────────────────────────────────
// Memory Service — Store, Retrieve, Context Assembly
// ─────────────────────────────────────────────────

const embeddings = require('./embeddings');
const ollama = require('./ollama');

/**
 * Retrieve relevant context for a user message.
 * Returns assembled context string for prompt injection.
 */
async function retrieveContext(db, userMessage, personaName = 'baymax') {
  const contextParts = [];

  // 1. Get user profile summary
  const profile = db.prepare('SELECT summary FROM user_profile WHERE id = 1').get();
  if (profile?.summary) {
    contextParts.push(`## About the User\n${profile.summary}`);
  }

  // 2. Semantic search for relevant facts
  const queryEmbedding = await embeddings.getEmbedding(userMessage);
  if (queryEmbedding) {
    const relevantFacts = embeddings.searchFacts(db, queryEmbedding, {
      limit: 15,
      minSimilarity: 0.3,
    });

    if (relevantFacts.length > 0) {
      const factStrings = relevantFacts.map((f) => {
        const meta = f.person_name ? `[about ${f.person_name}] ` : '';
        return `- ${meta}${f.content} (${f.category}, ${formatDate(f.created_at)})`;
      });

      contextParts.push(`## Relevant Memories\n${factStrings.join('\n')}`);
    }

    // 3. If message mentions a person, get all facts about them
    const mentionedPeople = db.prepare(
      "SELECT DISTINCT person_name FROM facts WHERE person_name IS NOT NULL AND person_name != ''"
    ).all().map((r) => r.person_name);

    for (const person of mentionedPeople) {
      // Simple check: does the message contain the person's name?
      const lowerMsg = userMessage.toLowerCase();
      const lowerPerson = person.toLowerCase();
      if (lowerMsg.includes(lowerPerson) || lowerPerson.includes(lowerMsg)) {
        const personFacts = db.prepare(
          'SELECT content, category, created_at FROM facts WHERE person_name = ? ORDER BY created_at DESC LIMIT 20'
        ).all(person);

        const personSummary = db.prepare('SELECT summary, mention_count FROM people WHERE name = ?').get(person);

        if (personFacts.length > 0) {
          const factsStr = personFacts.map((f) => `- ${f.content} (${formatDate(f.created_at)})`).join('\n');
          contextParts.push(`## About ${person}\nMentioned ${personSummary?.mention_count || 0} times. ${personSummary?.summary || ''}\n${factsStr}`);
        }
      }
    }
  }

  // 4. Recent messages from last few conversations (for continuity)
  const recentMessages = db.prepare(`
    SELECT m.content, m.role, m.created_at, c.persona
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE m.role IN ('user', 'assistant')
    ORDER BY m.created_at DESC
    LIMIT 20
  `).all().reverse();

  if (recentMessages.length > 0) {
    const chatLog = recentMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Baymax'}: ${m.content}`)
      .join('\n');
    contextParts.push(`## Recent Conversations\n${chatLog}`);
  }

  // 5. Today's summary if exists
  const today = new Date().toISOString().split('T')[0];
  const todaySummary = db.prepare('SELECT summary, mood FROM daily_summaries WHERE date = ?').get(today);
  if (todaySummary) {
    contextParts.push(`## Today's Context\nMood: ${todaySummary.mood || 'unknown'}\n${todaySummary.summary}`);
  }

  return contextParts.length > 0
    ? `<memory>\n${contextParts.join('\n\n')}\n</memory>`
    : '';
}

/**
 * Get all facts, optionally filtered.
 */
function getFacts(db, options = {}) {
  const { category, personName, limit = 50, offset = 0 } = options;

  let query = 'SELECT * FROM facts WHERE 1=1';
  const params = [];

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  if (personName) {
    query += ' AND person_name = ?';
    params.push(personName);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

/**
 * Get all known people with their summaries.
 */
function getPeople(db) {
  return db.prepare(`
    SELECT p.*, COUNT(f.id) as fact_count
    FROM people p
    LEFT JOIN facts f ON f.person_name = p.name
    GROUP BY p.id
    ORDER BY p.last_seen DESC
  `).all();
}

/**
 * Get recent conversations.
 */
function getConversations(db, limit = 20) {
  return db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
      (SELECT content FROM messages WHERE conversation_id = c.id AND role = 'user' ORDER BY created_at ASC LIMIT 1) as first_message
    FROM conversations c
    ORDER BY c.started_at DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Get conversation with its messages.
 */
function getConversation(db, id) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!conv) return null;

  const messages = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(id);

  return { ...conv, messages };
}

/**
 * Delete a fact.
 */
function deleteFact(db, id) {
  return db.prepare('DELETE FROM facts WHERE id = ?').run(id);
}

function formatDate(isoString) {
  if (!isoString) return 'unknown';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return isoString;
  }
}

module.exports = {
  retrieveContext,
  getFacts,
  getPeople,
  getConversations,
  getConversation,
  deleteFact,
};
