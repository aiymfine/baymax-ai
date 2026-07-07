import React from 'react';
import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import * as api from '../services/api';
import { useChat } from '../hooks/useChat';

export default function ConversationsScreen() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { loadConversation, clear } = useChat();

  const load = async () => {
    setLoading(true);
    try {
      const convs = await api.getConversations();
      setConversations(convs);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSelect = async (conv) => {
    // In a real navigation setup, this would navigate to chat with the conversation loaded
    // For now, we'll show a confirmation
    Alert.alert(
      'Open Conversation',
      `"${conv.title || 'Untitled'}" (${conv.message_count} messages)\n\nTap OK to load this conversation.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open',
          onPress: async () => {
            await loadConversation(conv.id);
            // Navigate would happen here with a proper router setup
          },
        },
      ]
    );
  };

  const handleDelete = (conv) => {
    Alert.alert(
      'Delete',
      `Delete "${conv.title || 'Untitled'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await api.deleteConversation(conv.id);
            setConversations((prev) => prev.filter((c) => c.id !== conv.id));
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>💬 History</Text>
        <TouchableOpacity onPress={load} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color="#64748b" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={loading || conversations.length === 0 ? styles.emptyList : styles.list}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color="#334155" />
            <Text style={styles.emptyText}>No conversations yet</Text>
            <Text style={styles.emptySubtext}>Start chatting to create history</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.convCard}
            onPress={() => handleSelect(item)}
            onLongPress={() => handleDelete(item)}
          >
            <View style={styles.convHeader}>
              <Text style={styles.convPersona}>{getPersonaEmoji(item.persona)} {item.persona}</Text>
              <Text style={styles.convCount}>{item.message_count} msgs</Text>
            </View>
            <Text style={styles.convTitle} numberOfLines={2}>{item.title || 'Untitled'}</Text>
            <Text style={styles.convDate}>{formatDate(item.started_at)}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function getPersonaEmoji(name) {
  const emojis = { baymax: '🤖', psychologist: '🧠', teacher: '📚', advisor: '💼' };
  return emojis[name] || '💬';
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 12 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#e2e8f0' },
  refreshBtn: { position: 'absolute', right: 16 },
  list: { padding: 12, gap: 8 },
  emptyList: { flexGrow: 1 },
  emptyState: { alignItems: 'center', paddingVertical: 80, gap: 12 },
  emptyText: { color: '#475569', fontSize: 17 },
  emptySubtext: { color: '#334155', fontSize: 14 },
  convCard: { backgroundColor: '#1a1a3e', borderRadius: 12, padding: 14, gap: 6 },
  convHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convPersona: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  convCount: { color: '#475569', fontSize: 12 },
  convTitle: { color: '#e2e8f0', fontSize: 15, fontWeight: '500' },
  convDate: { color: '#475569', fontSize: 12 },
});
