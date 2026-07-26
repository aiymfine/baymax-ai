// ─────────────────────────────────────────────────
// useChat Hook — Manages conversation state (global)
// ─────────────────────────────────────────────────

import { useState, useCallback, useRef, createContext, useContext } from 'react';
import * as api from '../services/api';

// ── Global state via Context ─────────────────────
const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [persona, setPersonaState] = useState('baymax');
  const loadingRef = useRef(false);

  const send = useCallback(async (text) => {
    if (!text.trim() || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    // Optimistically add user message
    const userMsg = { role: 'user', content: text, temp: true };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const result = await api.sendMessage({
        message: text,
        persona,
        conversationId,
      });

      // Replace temp user message with real one, add assistant response
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => !m.temp);
        return [
          ...withoutTemp,
          { role: 'user', content: text },
          { role: 'assistant', content: result.response },
        ];
      });

      if (result.conversationId && !conversationId) {
        setConversationId(result.conversationId);
      }

      return result;
    } catch (err) {
      // Remove optimistic message, add error
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => !m.temp);
        return [
          ...withoutTemp,
          { role: 'error', content: err.message },
        ];
      });
      throw err;
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [persona, conversationId]);

  // Switching persona starts a fresh conversation
  const setPersona = useCallback((newPersona) => {
    setPersonaState(newPersona);
    setMessages([]);
    setConversationId(null);
  }, []);

  const loadConversation = useCallback(async (id) => {
    try {
      const conv = await api.getConversation(id);
      setConversationId(conv.id);
      setMessages(conv.messages || []);
      setPersonaState(conv.persona || 'baymax');
      return conv;
    } catch (err) {
      console.error('Failed to load conversation:', err);
      throw err;
    }
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  const value = {
    messages,
    loading,
    conversationId,
    persona,
    setPersona,
    send,
    loadConversation,
    clear,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
