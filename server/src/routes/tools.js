// ─────────────────────────────────────────────────
// Tools Routes — Manual tool execution + history
// ─────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { getDb } = require('../db/schema');
const tools = require('../services/tools');
const activity = require('../services/activity');

/**
 * GET /api/tools — List available tools
 */
router.get('/', (req, res) => {
  res.json({
    tools: tools.TOOL_DEFINITIONS.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    })),
  });
});

/**
 * POST /api/tools/exec — Execute a tool manually
 * Body: { tool: "shell_exec", args: { command: "whoami" } }
 */
router.post('/exec', async (req, res) => {
  try {
    const { tool, args = {} } = req.body;

    if (!tool) {
      return res.status(400).json({ error: 'Tool name required' });
    }

    const validTools = tools.TOOL_DEFINITIONS.map((t) => t.function.name);
    if (!validTools.includes(tool)) {
      return res.status(400).json({ error: `Unknown tool: ${tool}`, available: validTools });
    }

    const start = Date.now();
    const result = await tools.executeTool(tool, args);
    const duration = Date.now() - start;

    // Log to DB
    try {
      const db = getDb();
      db.prepare(
        `INSERT INTO tool_executions (tool_name, arguments, result, success, duration_ms, persona)
         VALUES (?, ?, ?, ?, ?, 'manual')`
      ).run(
        tool,
        JSON.stringify(args),
        JSON.stringify(result).slice(0, 10000),
        result.success ? 1 : 0,
        duration
      );

      activity.logActivity(db, {
        type: 'tool',
        description: `${tool}: ${args.command || args.path || args.url || JSON.stringify(args).slice(0, 100)}`,
        details: { tool, args, success: result.success, duration },
        persona: 'manual',
      });
    } catch {}

    res.json({ tool, args, result, duration_ms: duration });
  } catch (err) {
    console.error('[Tools] Exec error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tools/history — Get tool execution history
 */
router.get('/history', (req, res) => {
  try {
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const history = db.prepare(
      'SELECT * FROM tool_executions ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tools/activity — Get recent activity for session resume
 */
router.get('/activity', (req, res) => {
  try {
    const db = getDb();
    const summary = activity.getSessionResumeSummary(db);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tools/status — Quick system status
 */
router.get('/status', (req, res) => {
  try {
    const status = tools.systemStatus(req.query.metric || 'all');
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
