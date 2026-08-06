// ─────────────────────────────────────────────────
// Chat Routes — Core conversation endpoint
// ─────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { getDb } = require('../db/schema');
const memory = require('../services/memory');
const ollama = require('../services/ollama');
const extractor = require('../services/extractor');
const { TOOL_DEFINITIONS, executeTool } = require('../services/tools');
const activity = require('../services/activity');
const emotion = require('../services/emotion');

// Personas that have tool execution enabled
const TOOL_ENABLED_PERSONAS = ['null'];

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
        const facts = await extractor.processAndStoreFacts(db, message.trim(), userMsgId);
        // Update user profile every 5+ new facts
        if (facts.length > 0) {
          const stats = db.prepare('SELECT COUNT(*) as c FROM facts').get();
          if (stats.c % 5 === 0 || stats.c <= 5) {
            await extractor.updateUserProfile(db);
          }
        }
      } catch (err) {
        console.error('[Chat] Fact extraction failed:', err.message);
      }
    });

    // Retrieve relevant context
    const context = await memory.retrieveContext(db, message, persona);
    
    // Process emotional state — Baymax's mood shifts based on what user says
    const moodContext = emotion.processInteraction(db, message.trim());

    // Build conversation history (last 20 messages from this conversation)
    const history = db.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? AND role IN (\'user\', \'assistant\') ORDER BY created_at DESC LIMIT 20'
    ).all(convId).reverse();

    // Send to Ollama — inject mood context
    let fullPrompt = systemPrompt;
    if (context) fullPrompt += '\n\n' + context;
    fullPrompt += emotion.getMoodContext(db);

    const response = await ollama.chat({
      system: fullPrompt,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });

    const responseText = typeof response === 'string' ? response : (response.content || '');

    // Store assistant response
    db.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    ).run(convId, 'assistant', responseText);

    // Update conversation title if first exchange
    const msgCount = db.prepare(
      'SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?'
    ).get(convId).c;
    if (msgCount <= 2) {
      // Generate a short title from the first message
      const shortTitle = message.trim().slice(0, 50);
      db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(shortTitle, convId);
      // Try to generate a better title in background
      setImmediate(async () => {
        try {
          const titleResp = await ollama.chat({
            messages: [{
              role: 'user',
              content: `Generate a very short title (3-5 words max, no quotes) for a conversation that starts with this message: "${message.trim().slice(0, 200)}". Reply with ONLY the title, nothing else.`,
            }],
          });
          const titleText = typeof titleResp === 'string' ? titleResp : (titleResp.content || '');
          const cleanTitle = titleText.trim().replace(/^["']|["']$/g, '').slice(0, 60);
          if (cleanTitle) {
            db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(cleanTitle, convId);
          }
        } catch {}
      });
    }

    res.json({
      response: responseText,
      conversationId: convId,
      factsExtracted: true,
      mood: emotion.getMoodInfo(db),
    });
  } catch (err) {
    console.error('[Chat] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/chat/stream — SSE streaming chat endpoint
 * Body: { message, persona, conversationId? }
 */
router.post('/stream', async (req, res) => {
  try {
    const { message, persona = 'baymax', conversationId } = req.body;

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
        const facts = await extractor.processAndStoreFacts(db, message, userMsgResult.lastInsertRowid);
        if (facts.length > 0) {
          const stats = db.prepare('SELECT COUNT(*) as c FROM facts').get();
          if (stats.c % 5 === 0 || stats.c <= 5) {
            await extractor.updateUserProfile(db);
          }
        }
      } catch (e) {
        console.error('[Chat] Fact extraction failed:', e.message);
      }
    });

    const context = await memory.retrieveContext(db, message, persona);
    emotion.processInteraction(db, message);
    const history = db.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? AND role IN (\'user\', \'assistant\') ORDER BY created_at DESC LIMIT 20'
    ).all(convId).reverse();

    let fullPrompt = systemPrompt;
    if (context) fullPrompt += '\n\n' + context;
    fullPrompt += emotion.getMoodContext(db);

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

/**
 * POST /api/chat/agent — Chat with tool execution (agent loop)
 * For personas like "null" that can run commands.
 * Body: { message, persona, conversationId? }
 * Returns: { response, conversationId, toolExecutions, iterations }
 */
router.post('/agent', async (req, res) => {
  try {
    const { message, persona = 'null', conversationId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const db = getDb();

    // Get persona system prompt
    const personaData = db.prepare('SELECT system_prompt FROM personas WHERE name = ?').get(persona);
    const systemPrompt = personaData?.system_prompt || 'You are a helpful AI assistant with tool execution capabilities.';

    // Create or get conversation
    let convId = conversationId;
    if (!convId) {
      const result = db.prepare('INSERT INTO conversations (persona) VALUES (?)').run(persona);
      convId = result.lastInsertRowid;
    }

    // Store user message
    db.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    ).run(convId, 'user', message.trim());

    // Extract facts in background
    setImmediate(async () => {
      try {
        await extractor.processAndStoreFacts(db, message.trim(), null);
      } catch (err) {
        console.error('[Agent] Fact extraction failed:', err.message);
      }
    });

    // Retrieve memory context
    const context = await memory.retrieveContext(db, message, persona);

    // Build conversation history (last 20 messages)
    const history = db.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? AND role IN (\'user\', \'assistant\') ORDER BY created_at DESC LIMIT 20'
    ).all(convId).reverse();

    // Build the full system prompt with memory context + activity context
    let fullSystem = systemPrompt;
    if (context) fullSystem += '\n\n' + context;

    // Add activity context (what was happening recently)
    const activityContext = activity.buildActivityContext(db);
    if (activityContext) fullSystem += '\n\n' + activityContext;

    // Add tool usage instructions
    fullSystem += '\n\n## Your Tools\nYou have access to the following tools: shell_exec, file_read, file_write, http_request, system_status, list_directory.\nUse them proactively to actually DO things, not just talk about them. When a task requires action, use tools.';

    // Run the agent loop
    const start = Date.now();
    const agentMessages = history.map((m) => ({ role: m.role, content: m.content }));

    const result = await ollama.chatWithTools({
      messages: agentMessages,
      system: fullSystem,
      tools: TOOL_DEFINITIONS,
      maxIterations: 10,
    });

    const duration = Date.now() - start;

    // Store assistant response
    db.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    ).run(convId, 'assistant', result.content);

    // Log tool executions to DB
    for (const exec of result.executionLog) {
      db.prepare(
        `INSERT INTO tool_executions (tool_name, arguments, result, success, conversation_id, persona, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        exec.tool,
        JSON.stringify(exec.args),
        JSON.stringify(exec.result).slice(0, 10000),
        exec.result?.success ? 1 : 0,
        convId,
        persona,
        exec.duration_ms || null
      );

      // Log to activity
      activity.logActivity(db, {
        type: 'tool',
        description: `${exec.tool}: ${exec.args.command || exec.args.path || exec.args.url || JSON.stringify(exec.args).slice(0, 100)}`,
        details: {
          tool: exec.tool,
          success: exec.result?.success,
          conversationId: convId,
        },
        persona,
      });
    }

    // Log the overall activity
    activity.logActivity(db, {
      type: 'chat_agent',
      description: `Agent task: "${message.trim().slice(0, 100)}" → ${result.executionLog.length} tools used, ${result.iterations} iterations`,
      details: {
        message: message.trim().slice(0, 200),
        toolsUsed: result.executionLog.length,
        iterations: result.iterations,
        duration,
      },
      persona,
    });

    // Update conversation title if first exchange
    const msgCount = db.prepare(
      'SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?'
    ).get(convId).c;
    if (msgCount <= 2) {
      const shortTitle = message.trim().slice(0, 50);
      db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(shortTitle, convId);
    }

    res.json({
      response: result.content,
      conversationId: convId,
      toolExecutions: result.executionLog.map((e) => ({
        tool: e.tool,
        args: e.args,
        success: e.result?.success,
        output: e.result?.output || e.result?.error || e.result?.body || JSON.stringify(e.result).slice(0, 500),
      })),
      iterations: result.iterations,
      truncated: result.truncated || false,
      duration_ms: duration,
    });
  } catch (err) {
    console.error('[Agent] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/chat/agent/stream — Streaming agent with tool execution via SSE
 * Body: { message, persona, conversationId? }
 * SSE Events: tool_start, tool_result, content, done
 */
router.post('/agent/stream', async (req, res) => {
  try {
    const { message, persona = 'null', conversationId } = req.body;

    if (!message) return res.status(400).json({ error: 'Message is required' });

    const db = getDb();
    const personaData = db.prepare('SELECT system_prompt FROM personas WHERE name = ?').get(persona);
    const systemPrompt = personaData?.system_prompt || 'You are a helpful AI with tool access.';

    let convId = conversationId;
    if (!convId) {
      const result = db.prepare('INSERT INTO conversations (persona) VALUES (?)').run(persona);
      convId = result.lastInsertRowid;
    }

    db.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    ).run(convId, 'user', message.trim());

    const context = await memory.retrieveContext(db, message, persona);
    const activityContext = activity.buildActivityContext(db);

    const history = db.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? AND role IN (\'user\', \'assistant\') ORDER BY created_at DESC LIMIT 20'
    ).all(convId).reverse();

    let fullSystem = systemPrompt;
    if (context) fullSystem += '\n\n' + context;
    if (activityContext) fullSystem += '\n\n' + activityContext;
    fullSystem += '\n\n## Your Tools\nYou have: shell_exec, file_read, file_write, http_request, system_status, list_directory. Use them proactively.';

    // SSE setup
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Agent loop with SSE
    const allMessages = history.map((m) => ({ role: m.role, content: m.content }));
    const executionLog = [];
    const maxIterations = 10;

    for (let i = 0; i < maxIterations; i++) {
      const result = await ollama.chat({
        messages: allMessages,
        system: fullSystem,
        stream: false,
        tools: TOOL_DEFINITIONS,
      });

      if (!result.toolCalls || result.toolCalls.length === 0) {
        // Final response
        if (result.content) {
          send('content', { content: result.content });
        }
        send('done', { conversationId: convId, iterations: i + 1, toolsUsed: executionLog.length });
        break;
      }

      // Process tool calls
      allMessages.push({
        role: 'assistant',
        content: result.content || '',
        tool_calls: result.toolCalls,
      });

      for (const call of result.toolCalls) {
        const funcName = call.function?.name;
        let funcArgs = call.function?.arguments;
        if (typeof funcArgs === 'string') {
          try { funcArgs = JSON.parse(funcArgs); } catch { funcArgs = {}; }
        }
        if (!funcArgs) funcArgs = {};

        send('tool_start', {
          tool: funcName,
          args: funcArgs,
          iteration: i + 1,
        });

        const toolResult = await executeTool(funcName, funcArgs);

        send('tool_result', {
          tool: funcName,
          success: toolResult.success,
          output: toolResult.output || toolResult.error || toolResult.body || JSON.stringify(toolResult).slice(0, 2000),
        });

        executionLog.push({ tool: funcName, args: funcArgs, result: toolResult });

        allMessages.push({
          role: 'tool',
          content: JSON.stringify(toolResult),
        });
      }
    }

    // Store final response
    // Reconstruct from last assistant content
    const lastAssistant = allMessages.filter((m) => m.role === 'assistant').pop();
    if (lastAssistant?.content) {
      db.prepare(
        'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
      ).run(convId, 'assistant', lastAssistant.content);
    }

    // Log executions
    for (const exec of executionLog) {
      db.prepare(
        `INSERT INTO tool_executions (tool_name, arguments, result, success, conversation_id, persona)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        exec.tool,
        JSON.stringify(exec.args),
        JSON.stringify(exec.result).slice(0, 10000),
        exec.result?.success ? 1 : 0,
        convId,
        persona
      );
    }

    if (executionLog.length > 0) {
      activity.logActivity(db, {
        type: 'tool_stream',
        description: `Streamed agent task: "${message.trim().slice(0, 80)}" → ${executionLog.length} tools`,
        details: { toolsUsed: executionLog.length },
        persona,
      });
    }

    res.end();
  } catch (err) {
    console.error('[Agent Stream] Error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

module.exports = router;
