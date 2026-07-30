import React from 'react';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { Text, View, TouchableOpacity, TextInput, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChat } from '../../hooks/useChat';
import * as api from '../../services/api';
import ChatBubble from '../../components/ChatBubble';
import PersonaSelector from '../../components/PersonaSelector';
import CheckInBanner from '../../components/CheckInBanner';

export default function ChatScreen() {
  const {
    messages,
    loading,
    persona,
    setPersona,
    send,
    loadConversation,
    clear,
  } = useChat();

  const [input, setInput] = React.useState('');
  const [personas, setPersonas] = React.useState([]);
  const [healthStatus, setHealthStatus] = React.useState(null);
  const [checkIns, setCheckIns] = React.useState([]);
  const [checkInModal, setCheckInModal] = React.useState(null);
  const flatListRef = React.useRef(null);

  // Load personas + check-ins on mount + poll health every 30s
  useEffect(() => {
    api.getPersonas().then(setPersonas).catch(console.error);
    refreshCheckIns();
    const checkHealth = () => api.checkHealth().then(setHealthStatus).catch(() => {});
    checkHealth();
    const interval = setInterval(checkHealth, 30_000);
    // Poll for check-ins every 2 min
    const checkInInterval = setInterval(refreshCheckIns, 120_000);
    return () => { clearInterval(interval); clearInterval(checkInInterval); };
  }, []);

  const refreshCheckIns = async () => {
    try {
      const cis = await api.getUnreadCheckIns();
      setCheckIns(cis);
    } catch {}
  };

  const handleCheckInOpen = (ci) => {
    setCheckInModal(ci);
  };

  const handleCheckInDismiss = async (id) => {
    setCheckIns((prev) => prev.filter((c) => c.id !== id));
    try { await api.dismissCheckIn(id); } catch {}
  };

  const handleCheckInReply = async () => {
    if (!checkInModal) return;
    // Start a conversation with the check-in message as context
    const msg = checkInModal.message;
    setCheckInModal(null);
    await api.markCheckInRead(checkInModal.id);
    setCheckIns((prev) => prev.filter((c) => c.id !== checkInModal.id));
    // Send the check-in as if the user is continuing from it
    await send(`(saw your check-in: "${msg}") hey`);
  };

  const handleCheckInClose = async () => {
    if (!checkInModal) return;
    await api.markCheckInRead(checkInModal.id);
    setCheckIns((prev) => prev.filter((c) => c.id !== checkInModal.id));
    setCheckInModal(null);
  };

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
        <Text style={styles.headerTitle}>✨ Baymax</Text>
        {healthStatus?.ollama && (
          <View style={[styles.statusDot, { backgroundColor: healthStatus.ollama.ok ? '#22c55e' : '#ef4444' }]} />
        )}
        {!healthStatus?.ollama?.ok && healthStatus && (
          <Text style={styles.statusText}>Ollama not connected</Text>
        )}
        <TouchableOpacity style={styles.newChatBtn} onPress={clear}>
          <Ionicons name="add-circle-outline" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {/* Persona selector */}
      <PersonaSelector
        personas={personas}
        selected={persona}
        onSelect={setPersona}
      />

      {/* Check-in banner */}
      <CheckInBanner
        checkIns={checkIns}
        onOpen={handleCheckInOpen}
        onDismiss={handleCheckInDismiss}
      />

      {/* Check-in modal */}
      {checkInModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="sparkles" size={22} color="#a78bfa" />
              <Text style={styles.modalTitle}>Check-in from {checkInModal.persona}</Text>
              <TouchableOpacity onPress={handleCheckInClose}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalMessage}>{checkInModal.message}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={handleCheckInClose}>
                <Text style={styles.modalBtnText}>Thanks 🫶</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={handleCheckInReply}>
                <Text style={styles.modalBtnPrimaryText}>Reply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Ollama warning */}
      {healthStatus && !healthStatus.ollama?.ok && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning" size={16} color="#f59e0b" />
          <Text style={styles.warningText}>
            Ollama not connected. Start it with: ollama serve
          </Text>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={loading ? [...messages, { role: 'typing', content: '' }] : messages}
        keyExtractor={(item, i) => i.toString()}
        renderItem={({ item }) =>
          item.role === 'typing' ? (
            <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}>
              <View style={styles.avatar}>
                <Ionicons name="robot" size={20} color="#60a5fa" />
              </View>
              <View style={[styles.bubble, { backgroundColor: '#1e293b' }]}>
                <ActivityIndicator size="small" color="#60a5fa" />
              </View>
            </View>
          ) : (
            <ChatBubble message={item} />
          )
        }
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>✨</Text>
            <Text style={styles.emptyTitle}>Hey, I'm Bestie</Text>
            <Text style={styles.emptySubtitle}>
              your AI friend that actually remembers stuff{'\n'}
              pick a vibe above and say hi 👋
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
  newChatBtn: {
    position: 'absolute',
    right: 16,
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
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  bubble: {
    borderRadius: 18,
    padding: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#2d1f0e',
    borderBottomWidth: 1,
    borderBottomColor: '#f59e0b33',
  },
  warningText: {
    color: '#f59e0b',
    fontSize: 12,
    flex: 1,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#1a1a3e',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: '#a78bfa44',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  modalTitle: {
    flex: 1,
    color: '#a78bfa',
    fontSize: 15,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  modalMessage: {
    color: '#e2e8f0',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#1e293b',
  },
  modalBtnPrimary: {
    backgroundColor: '#3b82f6',
  },
  modalBtnText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '600',
  },
  modalBtnPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
