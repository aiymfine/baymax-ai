// ─────────────────────────────────────────────────
// Embeddings + Vector Search
// ─────────────────────────────────────────────────

const ollama = require('./ollama');

// Cosine similarity between two vectors
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// Embed a single text, return Float32Array-like JS array
async function getEmbedding(text) {
  const embeddings = await ollama.embed(text);
  if (!embeddings || embeddings.length === 0) return null;
  return embeddings[0];
}

// Store embedding as JSON string in SQLite
function pack(vec) {
  return JSON.stringify(vec);
}

// Parse embedding back to array
function unpack(blob) {
  if (!blob) return null;
  if (typeof blob === 'string') return JSON.parse(blob);
  // If it's a Buffer (BLOB from SQLite)
  return JSON.parse(blob.toString('utf-8'));
}

// Search facts by semantic similarity to a query
function searchFacts(db, queryEmbedding, options = {}) {
  const {
    limit = 20,
    category = null,        // filter by category
    personName = null,     // filter by person
    minSimilarity = 0.3,
    daysBack = null,       // only facts from last N days
  } = options;

  let facts = db.prepare(
    'SELECT id, content, category, person_name, confidence, created_at, embedding FROM facts'
  ).all();

  // Filter by category
  if (category) {
    facts = facts.filter((f) => f.category === category);
  }

  // Filter by person
  if (personName) {
    facts = facts.filter((f) => f.person_name === personName);
  }

  // Filter by recency
  if (daysBack) {
    const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString();
    facts = facts.filter((f) => f.created_at >= cutoff);
  }

  // Compute similarity scores
  const scored = [];
  for (const fact of facts) {
    const vec = unpack(fact.embedding);
    if (!vec) continue;
    const sim = cosineSimilarity(queryEmbedding, vec);
    if (sim >= minSimilarity) {
      scored.push({ ...fact, similarity: sim });
    }
  }

  // Sort by similarity (best first), then by recency
  scored.sort((a, b) => b.similarity - a.similarity || b.created_at.localeCompare(a.created_at));

  return scored.slice(0, limit);
}

module.exports = { cosineSimilarity, getEmbedding, pack, unpack, searchFacts };
