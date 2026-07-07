import React from 'react';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { Text, View, TouchableOpacity, TextInput, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChat } from '../hooks/useChat';
import * as api from '../services/api';
import ChatBubble from '../components/ChatBubble';
import PersonaSelector from '../components/PersonaSelector';

export default function ChatScreen() {
  const {
    messages,
    loading,
    persona,
    setPersona,
    send,
    loadConversation,
  } = useChat();

  const [input, setInput] = React.useState('');
  const [personas, setPersonas] = React.useState([]);
  const [healthStatus, setHealthStatus] = React.useState(null);
  const flatListRef = React.useRef(null);

  // Load personas on mount
  useEffect(() => {
    api.getPersonas().then(setPersonas).catch(console.error);
    api.checkHealth().then(setHealthStatus).catch(console.error);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    try {
      await send(text);
    } catch (err) {
      // Error is already shown in messages
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🤖 Baymax</Text>
        {healthStatus?.ollama && (
          <View style={[styles.statusDot, { backgroundColor: healthStatus.ollama.ok ? '#22c55e' : '#ef4444' }]} />
        )}
        {!healthStatus?.ollama?.ok && healthStatus && (
          <Text style={styles.statusText}>Ollama not connected</Text>
        )}
      </View>

      {/* Persona selector */}
      <PersonaSelector
        personas={personas}
        selected={persona}
        onSelect={setPersona}
      />

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, i) => i.toString()}
        renderItem={({ item }) => <ChatBubble message={item} />}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🤖</Text>
            <Text style={styles.emptyTitle}>Hey, I'm Baymax</Text>
            <Text style={styles.emptySubtitle}>
              I'm your personal AI companion. I remember everything we talk about.
              {'\n'}Pick a persona above and say hi!
            </Text>
          </View>
        }
      />

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Say something..."
            placeholderTextColor="#475569"
            multiline
            maxLength={2000}
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.sendBtn, loading && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={loading || !input.trim()}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="arrow-up" size={22} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 11,
    color: '#ef4444',
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    paddingVertical: 8,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#e2e8f0',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 40,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#0f0f23',
  },
  input: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    color: '#e2e8f0',
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#1e293b',
  },
});
