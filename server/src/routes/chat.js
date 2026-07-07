// ─────────────────────────────────────────────────
// Chat Routes — Core conversation endpoint
// ─────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { getDb } = require('../db/schema');
const memory = require('../services/memory');
const ollama = require('../services/ollama');
const extractor = require('../services/extractor');

/**
 * POST /api/chat — Send a message and get a response
 * Body: { message, persona, conversationId? }
 */
router.post('/', async (req, res) => {
  try {
    const { message, persona = 'baymax', conversationId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const db = getDb();

    // Get persona system prompt
    const personaData = db.prepare('SELECT system_prompt FROM personas WHERE name = ?').get(persona);
    const systemPrompt = personaData?.system_prompt || 'You are Baymax, a helpful AI companion.';

    // Create or get conversation
    let convId = conversationId;
    if (!convId) {
      const result = db.prepare(
        'INSERT INTO conversations (persona) VALUES (?)'
      ).run(persona);
      convId = result.lastInsertRowid;
    }

    // Store user message
    const userMsgResult = db.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    ).run(convId, 'user', message.trim());
    const userMsgId = userMsgResult.lastInsertRowid;

    // Extract facts in background (don't block response)
    setImmediate(async () => {
      try {
        await extractor.processAndStoreFacts(db, message.trim(), userMsgId);
      } catch (err) {
        console.error('[Chat] Fact extraction failed:', err.message);
      }
    });

    // Retrieve relevant context
    const context = await memory.retrieveContext(db, message, persona);

    // Build conversation history (last 20 messages from this conversation)
    const history = db.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? AND role IN (\'user\', \'assistant\') ORDER BY created_at DESC LIMIT 20'
    ).all(convId).reverse();

    // Send to Ollama
    const fullPrompt = context ? `${systemPrompt}\n\n${context}` : systemPrompt;

    const response = await ollama.chat({
      system: fullPrompt,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });

    // Store assistant response
    db.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    ).run(convId, 'assistant', response);

    // Update conversation title if first message
    const msgCount = db.prepare(
      'SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?'
    ).get(convId).c;
    if (msgCount <= 2) {
      const title = message.trim().slice(0, 60) + (message.length > 60 ? '...' : '');
      db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, convId);
    }

    res.json({
      response,
      conversationId: convId,
      factsExtracted: true,
    });
  } catch (err) {
    console.error('[Chat] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/chat/stream — SSE streaming chat endpoint
 * Query: message, persona, conversationId?
 */
router.get('/stream', async (req, res) => {
  try {
    const { message, persona = 'baymax', conversationId } = req.query;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const db = getDb();
    const personaData = db.prepare('SELECT system_prompt FROM personas WHERE name = ?').get(persona);
    const systemPrompt = personaData?.system_prompt || 'You are Baymax.';

    let convId = conversationId;
    if (!convId) {
      const result = db.prepare('INSERT INTO conversations (persona) VALUES (?)').run(persona);
      convId = result.lastInsertRowid;
    }

    const userMsgResult = db.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    ).run(convId, 'user', message);

    setImmediate(async () => {
      try {
        await extractor.processAndStoreFacts(db, message, userMsgResult.lastInsertRowid);
      } catch (e) {
        console.error('[Chat] Fact extraction failed:', e.message);
      }
    });

    const context = await memory.retrieveContext(db, message, persona);
    const history = db.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? AND role IN (\'user\', \'assistant\') ORDER BY created_at DESC LIMIT 20'
    ).all(convId).reverse();

    const fullPrompt = context ? `${systemPrompt}\n\n${context}` : systemPrompt;

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const body = await ollama.chat({
      system: fullPrompt,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    });

    if (!body) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((l) => l.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              fullResponse += data.message.content;
              res.write(`data: ${JSON.stringify({ content: data.message.content })}\n\n`);
            }
            if (data.done) {
              res.write(`data: ${JSON.stringify({ done: true, conversationId: convId })}\n\n`);
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      }
    } catch (streamErr) {
      console.error('[Chat] Stream error:', streamErr.message);
    }

    // Store the full response
    if (fullResponse) {
      db.prepare(
        'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
      ).run(convId, 'assistant', fullResponse);
    }

    res.end();
  } catch (err) {
    console.error('[Chat] Stream setup error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

/**
 * GET /api/chat/conversations — List conversations
 */
router.get('/conversations', (req, res) => {
  try {
    const db = getDb();
    const conversations = memory.getConversations(db);
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/chat/conversations/:id — Get conversation with messages
 */
router.get('/conversations/:id', (req, res) => {
  try {
    const db = getDb();
    const conversation = memory.getConversation(db, req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/chat/conversations/:id — Delete a conversation
 */
router.delete('/conversations/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(req.params.id);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
