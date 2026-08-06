// ─────────────────────────────────────────────────
// Tool Execution Engine — Shell, Files, HTTP, System
// ─────────────────────────────────────────────────

const { exec: execCb, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_OUTPUT = 50_000; // 50KB output cap
const DEFAULT_TIMEOUT = 30_000;
const MAX_TIMEOUT = 120_000;

// ── Tool definitions for Ollama function calling ──

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'shell_exec',
      description: 'Execute a shell/terminal command on the system. Use for nmap, whois, dig, curl, ls, cat, ping, traceroute, netstat, ps, etc. Returns stdout, stderr, and exit code.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          timeout: { type: 'number', description: 'Timeout in milliseconds (default 30000, max 120000)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_read',
      description: 'Read the contents of a file from the filesystem.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the file' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_write',
      description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does. Creates parent directories automatically.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'http_request',
      description: 'Make an HTTP request to any URL. Useful for API testing, web scraping, checking web servers, downloading data.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to request' },
          method: { type: 'string', description: 'HTTP method: GET, POST, PUT, DELETE, PATCH', default: 'GET' },
          headers: { type: 'object', description: 'Request headers as key-value pairs' },
          body: { type: 'string', description: 'Request body (for POST/PUT/PATCH)' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'system_status',
      description: 'Get current system status: disk usage, memory, CPU load, uptime, network interfaces, and top processes. Pass metric to get specific info only.',
      parameters: {
        type: 'object',
        properties: {
          metric: { type: 'string', description: 'Which metric to return: disk, memory, cpu, network, processes, uptime, all', default: 'all' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List contents of a directory with file sizes and types.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (default: current directory)' },
          recursive: { type: 'boolean', description: 'List recursively (default: false)' },
        },
      },
    },
  },
];

// ── Execution functions ──

function shellExec(command, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve) => {
    const t = Math.min(timeout || DEFAULT_TIMEOUT, MAX_TIMEOUT);
    const isWindows = process.platform === 'win32';

    const fullCmd = isWindows
      ? `powershell.exe -Command "${command.replace(/"/g, '\\"')}"`
      : command;

    execCb(fullCmd, {
      timeout: t,
      maxBuffer: 1024 * 1024 * 5,
      cwd: process.cwd(),
      env: process.env,
      shell: isWindows ? 'powershell.exe' : '/bin/bash',
    }, (err, stdout, stderr) => {
      let output = '';
      const exitCode = err ? (err.code || 1) : 0;

      if (stdout) output += stdout;
      if (stderr) output += (output ? '\n' : '') + stderr;
      if (err && err.signal === 'SIGTERM') output += (output ? '\n' : '') + '[Command timed out]';

      // Truncate if too long
      if (output.length > MAX_OUTPUT) {
        output = output.slice(0, MAX_OUTPUT) + '\n\n... [output truncated, ' + output.length + ' chars total]';
      }

      resolve({
        success: exitCode === 0,
        exitCode,
        output: output.trim() || '[no output]',
      });
    });
  });
}

function fileRead(filePath) {
  try {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      return { success: false, error: `File not found: ${resolved}` };
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return { success: false, error: `Path is a directory, not a file: ${resolved}` };
    }
    if (stat.size > 5 * 1024 * 1024) {
      return { success: false, error: `File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Use shell_exec to read parts.` };
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    return {
      success: true,
      path: resolved,
      size: stat.size,
      content: content.length > MAX_OUTPUT ? content.slice(0, MAX_OUTPUT) + '\n... [truncated]' : content,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function fileWrite(filePath, content) {
  try {
    const resolved = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, 'utf-8');
    return { success: true, path: resolved, bytes: Buffer.byteLength(content) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function httpRequest({ url, method = 'GET', headers = {}, body }) {
  try {
    const opts = {
      method: method.toUpperCase(),
      headers,
      signal: AbortSignal.timeout(30000),
    };
    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      opts.body = body;
    }
    const res = await fetch(url, opts);
    const text = await res.text();
    return {
      success: true,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body: text.length > MAX_OUTPUT ? text.slice(0, MAX_OUTPUT) + '\n... [truncated]' : text,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function systemStatus(metric = 'all') {
  const m = metric.toLowerCase();
  const result = {};

  if (m === 'all' || m === 'disk') {
    try {
      const stats = fs.statSync(process.cwd());
      result.disk = {
        platform: process.platform,
        arch: process.arch,
        cwd: process.cwd(),
        note: 'Use shell_exec with "df -h" (Linux/Mac) or "Get-PSDrive" (Windows) for disk space',
      };
    } catch {}
  }

  if (m === 'all' || m === 'memory') {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    result.memory = {
      total: `${(totalMem / 1024 / 1024 / 1024).toFixed(1)} GB`,
      free: `${(freeMem / 1024 / 1024 / 1024).toFixed(1)} GB`,
      used: `${((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(1)} GB`,
      usagePercent: `${(((totalMem - freeMem) / totalMem) * 100).toFixed(1)}%`,
    };
  }

  if (m === 'all' || m === 'cpu') {
    const load = os.loadavg();
    result.cpu = {
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || 'unknown',
      loadAvg: {
        '1m': load[0].toFixed(2),
        '5m': load[1].toFixed(2),
        '15m': load[2].toFixed(2),
      },
    };
  }

  if (m === 'all' || m === 'network') {
    const interfaces = os.networkInterfaces();
    result.network = {};
    for (const [name, addrs] of Object.entries(interfaces)) {
      result.network[name] = (addrs || [])
        .filter((a) => !a.internal)
        .map((a) => ({ address: a.address, family: a.family }));
    }
  }

  if (m === 'all' || m === 'processes') {
    result.processes = {
      pid: process.pid,
      nodeVersion: process.version,
      uptime: `${(process.uptime() / 60).toFixed(1)} min`,
      note: 'Use shell_exec with "ps aux" (Linux/Mac) or "Get-Process" (Windows) for full process list',
    };
  }

  if (m === 'all' || m === 'uptime') {
    result.uptime = {
      system: `${(os.uptime() / 3600).toFixed(1)} hours`,
      hostname: os.hostname(),
      osType: os.type(),
      osRelease: os.release(),
    };
  }

  return { success: true, ...result };
}

function listDirectory(dirPath = '.', recursive = false) {
  try {
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved)) {
      return { success: false, error: `Directory not found: ${resolved}` };
    }
    const items = fs.readdirSync(resolved, { withFileTypes: true });
    const result = items.map((item) => {
      const fullPath = path.join(resolved, item.name);
      let size = '-';
      let type = item.isDirectory() ? 'dir' : 'file';
      try {
        if (item.isFile()) {
          const stat = fs.statSync(fullPath);
          size = `${(stat.size / 1024).toFixed(1)} KB`;
        }
      } catch {}
      return { name: item.name, type, size };
    });

    let finalResult = result;
    if (recursive) {
      finalResult = [];
      for (const item of items) {
        const itemPath = path.join(resolved, item.name);
        finalResult.push({ name: item.name, type: item.isDirectory() ? 'dir' : 'file', path: itemPath });
        if (item.isDirectory() && !item.name.startsWith('.') && !item.name.includes('node_modules')) {
          try {
            const sub = listDirectory(itemPath, false);
            // Just one level deep for safety
          } catch {}
        }
      }
    }

    return { success: true, path: resolved, items: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Dispatcher: route tool calls to handlers ──

async function executeTool(name, args) {
  const logEntry = {
    tool: name,
    args,
    timestamp: new Date().toISOString(),
  };

  let result;

  try {
    switch (name) {
      case 'shell_exec':
        result = await shellExec(args.command, args.timeout);
        break;
      case 'file_read':
        result = fileRead(args.path);
        break;
      case 'file_write':
        result = fileWrite(args.path, args.content);
        break;
      case 'http_request':
        result = await httpRequest(args);
        break;
      case 'system_status':
        result = systemStatus(args.metric);
        break;
      case 'list_directory':
        result = listDirectory(args.path || '.', args.recursive);
        break;
      default:
        result = { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }

  logEntry.result = result;
  return result;
}

module.exports = {
  TOOL_DEFINITIONS,
  executeTool,
  shellExec,
  fileRead,
  fileWrite,
  httpRequest,
  systemStatus,
  listDirectory,
};
