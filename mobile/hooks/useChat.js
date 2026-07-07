// ─────────────────────────────────────────────────
// useChat Hook — Manages conversation state
// ─────────────────────────────────────────────────

import { useState, useCallback, useRef } from 'react';
import * as api from '../services/api';

export function useChat() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [persona, setPersona] = useState('baymax');
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

  const loadConversation = useCallback(async (id) => {
    try {
      const conv = await api.getConversation(id);
      setConversationId(conv.id);
      setMessages(conv.messages || []);
      setPersona(conv.persona || 'baymax');
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

  return {
    messages,
    loading,
    conversationId,
    persona,
    setPersona,
    send,
    loadConversation,
    clear,
  };
}
