// ─────────────────────────────────────────────────
// Ollama Client — Chat + Embeddings
// ─────────────────────────────────────────────────

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'llama3.1';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

async function chat({ messages, system, stream = false }) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
      stream,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama chat error (${res.status}): ${err}`);
  }

  if (!stream) {
    const data = await res.json();
    return data.message?.content || data.content || '';
  }

  // Stream: return readable body
  return res.body;
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

module.exports = { chat, embed, checkHealth };
