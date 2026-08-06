// ─────────────────────────────────────────────────
// Ollama Client — Chat + Embeddings
// ─────────────────────────────────────────────────

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'llama3.1';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

async function chat({ messages, system, stream = false, tools = null }) {
  const body = {
    model: CHAT_MODEL,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    stream,
  };

  // Attach tools for function calling (Ollama v0.3.0+)
  if (tools && Array.isArray(tools) && tools.length > 0) {
    body.tools = tools;
  }

  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama chat error (${res.status}): ${err}`);
  }

  if (!stream) {
    const data = await res.json();
    // Return full message object (may contain tool_calls)
    return {
      content: data.message?.content || '',
      toolCalls: data.message?.tool_calls || null,
      done: data.done,
    };
  }

  // Stream: return readable body
  return res.body;
}

/**
 * Chat with tool support — runs the agent loop automatically.
 * Sends messages with tools, executes any tool_calls, feeds results back.
 * Returns final text response + execution log.
 */
async function chatWithTools({ messages, system, tools, maxIterations = 10 }) {
  const allMessages = [...messages];
  const executionLog = [];

  for (let i = 0; i < maxIterations; i++) {
    const result = await chat({
      messages: allMessages,
      system,
      stream: false,
      tools,
    });

    // No tool calls → we have the final response
    if (!result.toolCalls || result.toolCalls.length === 0) {
      return {
        content: result.content,
        executionLog,
        iterations: i + 1,
      };
    }

    // Process tool calls
    // Add assistant message with tool calls to history
    allMessages.push({
      role: 'assistant',
      content: result.content || '',
      tool_calls: result.toolCalls,
    });

    // Execute each tool call
    const { executeTool } = require('./tools');
    for (const call of result.toolCalls) {
      const funcName = call.function?.name || (typeof call === 'string' ? null : call.name);
      let funcArgs = call.function?.arguments;

      // Arguments can be string (JSON) or object
      if (typeof funcArgs === 'string') {
        try { funcArgs = JSON.parse(funcArgs); } catch { funcArgs = {}; }
      }
      if (!funcArgs) funcArgs = {};

      const toolEntry = {
        tool: funcName,
        args: funcArgs,
        timestamp: new Date().toISOString(),
      };

      const toolResult = await executeTool(funcName, funcArgs);

      toolEntry.result = toolResult;
      executionLog.push(toolEntry);

      // Feed result back to model
      allMessages.push({
        role: 'tool',
        content: JSON.stringify(toolResult),
      });
    }

    // Loop continues — model will either call more tools or give final answer
  }

  // Hit max iterations — return what we have
  return {
    content: '[Agent loop reached maximum iterations. Last execution logged.]',
    executionLog,
    iterations: maxIterations,
    truncated: true,
  };
}

async function embed(texts) {
  const input = Array.isArray(texts) ? texts : [texts];

  const res = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama embed error (${res.status}): ${err}`);
  }

  const data = await res.json();
  // Returns { embeddings: [[...], [...]] }
  return data.embeddings || [];
}

async function checkHealth() {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error('not ok');
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    return { ok: true, models };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { chat, chatWithTools, embed, checkHealth };
