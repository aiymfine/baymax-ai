# 🤖 Baymax — Your Personal AI Companion with Deep Memory

<p align="center">
  <strong>AI that actually remembers you.</strong><br/>
  Not another chatbot wrapper. Baymax learns from every conversation, builds a model of who you are,
  and uses that context to be a genuine companion — friend, psychologist, teacher, or advisor.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?logo=node.js" />
  <img src="https://img.shields.io/badge/SQLite-Embedded-003B57?logo=sqlite" />
  <img src="https://img.shields.io/badge/Ollama-Local_LLM-000000?logo=ollama" />
  <img src="https://img.shields.io/badge/Expo-React_Native-000020?logo=expo" />
  <img src="https://img.shields.io/badge/License-MIT-blue" />
</p>

---

## ✨ Features

- **🧠 Deep Memory System** — 4-layer architecture: raw storage → automatic fact extraction → semantic search → context assembly. Baymax doesn't just chat — it learns.
- **👤 People Knowledge** — Tracks everyone you mention. Ask "what do you think about [person]?" and get an opinion built from everything you've shared.
- **🎭 Persona System** — Switch between companion personalities: Baymax (warm friend), Dr. Mira (psychologist), Prof. Atlas (teacher), Sage (advisor), or create your own.
- **📱 Mobile-First** — Expo app for your phone. Chat anywhere.
- **🔒 Fully Private** — All data stays on YOUR machine. No cloud, no third parties, no tracking.
- **💰 100% Free** — Uses Ollama (local LLM), SQLite (local DB). Zero API costs.

## 🏗 Architecture

```
📱 Phone (Expo App)
   ├─ Chat interface with persona selector
   ├─ Memory browser (facts, people, stats)
   ├─ Conversation history
   └─ Settings (server URL, profile)

🖥️ Server (Node.js on your PC)
   ├─ Receive messages → retrieve memory context
   ├─ Build persona-aware prompt → send to Ollama
   ├─ Store response → extract facts in background
   ├─ Compute embeddings → index for semantic search
   └─ REST API for mobile app

🧠 Ollama (Local LLM)
   ├─ Chat completion (personas + context)
   ├─ Fact extraction (meta-prompting)
   ├─ User profile summarization
   └─ Embeddings (semantic memory search)
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+
- **Ollama** — [Install here](https://ollama.com)
- **Expo Go** app on your phone (from App Store / Play Store)
- Git

### 1. Clone and Install

```bash
git clone https://github.com/aiymfine/baymax-ai.git
cd baymax-ai
npm run install:all
```

### 2. Setup Ollama

```bash
# Start Ollama (runs in background)
ollama serve

# In a new terminal, pull required models
ollama pull llama3.1          # Chat model (~4.7GB)
ollama pull nomic-embed-text  # Embedding model (~274MB)
```

### 3. Configure

```bash
# Copy env template
cp .env.example .env

# Edit .env if needed (defaults work for local setup)
```

### 4. Start the Server

```bash
npm run dev:server
```

Server starts at `http://localhost:3200`. You should see:
```
  ╔═══════════════════════════════════════╗
  ║           🤖 Baymax v1.0.0            ║
  ║     Server running on port 3200       ║
  ╚═══════════════════════════════════════╝
```

### 5. Start the Mobile App

```bash
npm run dev:mobile
```

This opens the Expo DevTools. Scan the **QR code** with your phone's Expo Go app.

> **Important:** Make sure your phone and PC are on the **same Wi-Fi network**.
> The app connects to `http://localhost:3200` by default — change the server URL
> in Settings to your PC's local IP (e.g., `http://192.168.1.100:3200`) if needed.

### 6. Start Chatting!

Pick a persona and say hi. Baymax will start learning about you immediately.

---

## 🧠 How Memory Works

Baymax doesn't just store chat history. Here's what happens after every message:

1. **Transcript Stored** — Raw message saved with timestamp and context
2. **Fact Extraction** — Ollama analyzes the message and extracts structured facts:
   - Facts (objective info), Preferences, Opinions, People, Relationships, Events
3. **Embedding Computed** — Each fact gets a vector embedding for semantic search
4. **People Tracked** — New people get profile entries with mention counts
5. **Context Assembly** — When you ask something, Baymax:
   - Embeds your query
   - Finds semantically similar facts
   - Checks for mentioned people and pulls their full history
   - Assembles relevant memories + recent conversations into context
   - Builds a persona-specific prompt with all this context
   - Sends to Ollama → response

This is why Baymax's responses get better over time. More conversations = more context = deeper understanding.

---

## 🎭 Built-in Personas

| Name | Emoji | Description |
|------|-------|-------------|
| **Baymax** | 🤖 | Warm, supportive friend who remembers everything |
| **Dr. Mira** | 🧠 | Reflective psychologist — listens, asks, explores |
| **Prof. Atlas** | 📚 | Patient teacher — explains, challenges, helps learn |
| **Sage** | 💼 | Sharp advisor — strategic, direct, honest |

Create custom personas via the API or (coming soon) the app.

---

## 📁 Project Structure

```
baymax-ai/
├── server/
│   └── src/
│       ├── index.js              # Express server entry point
│       ├── db/
│       │   └── schema.js         # SQLite schema + initialization
│       ├── services/
│       │   ├── ollama.js         # Ollama HTTP client (chat + embed)
│       │   ├── memory.js         # Memory retrieval + context assembly
│       │   ├── embeddings.js     # Vector search + cosine similarity
│       │   └── extractor.js      # Automatic fact extraction
│       ├── routes/
│       │   ├── chat.js           # Chat endpoints (send, stream, history)
│       │   ├── memory.js         # Memory endpoints (facts, people, stats)
│       │   └── persona.js        # Persona management
│       └── personas/
│           └── definitions.js    # Persona system prompts
├── mobile/
│   ├── app/
│   │   ├── (tabs)/              # Tab screens
│   │   │   ├── _layout.js       # Tab navigator
│   │   │   ├── chat.js          # Main chat screen
│   │   │   ├── history.js       # Conversation history
│   │   │   ├── memory.js        # Memory browser
│   │   │   └── settings.js      # App settings
│   │   └── index.js            # Entry point (redirect to chat)
│   ├── components/
│   │   ├── ChatBubble.js        # Message bubble component
│   │   └── PersonaSelector.js   # Persona pill selector
│   ├── hooks/
│   │   └── useChat.js           # Chat state management hook
│   └── services/
│       └── api.js               # Server API client
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 🛠 Development

### Running Both (Server + Mobile)

```bash
npm run dev
```

### Server Only

```bash
cd server && npm run dev
```

### Mobile Only

```bash
cd mobile && npm start
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Send a message, get AI response |
| GET | `/api/chat/stream` | SSE streaming chat |
| GET | `/api/chat/conversations` | List all conversations |
| GET | `/api/chat/conversations/:id` | Get conversation with messages |
| DELETE | `/api/chat/conversations/:id` | Delete a conversation |
| GET | `/api/memory/facts` | List facts (filterable) |
| DELETE | `/api/memory/facts/:id` | Delete a fact |
| GET | `/api/memory/people` | List known people |
| GET | `/api/memory/profile` | Get user profile |
| PUT | `/api/memory/profile` | Update user profile |
| GET | `/api/memory/stats` | Memory statistics |
| GET | `/api/personas` | List personas |
| POST | `/api/personas` | Create custom persona |
| DELETE | `/api/personas/:name` | Delete custom persona |
| GET | `/api/health` | Server + Ollama health check |

---

## 🔮 Roadmap

- [ ] Voice input (record → transcribe on server)
- [ ] Voice output (TTS responses)
- [ ] Wake word activation
- [ ] Daily summary generation
- [ ] Mood tracking dashboard
- [ ] Custom persona creation in app
- [ ] Export/import memory data
- [ ] Multi-user support
- [ ] Desktop app (Tauri)
- [ ] Web app interface

---

## 📄 License

MIT — use it, fork it, build on it.

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/aiymfine">aiymfine</a>
</p>
