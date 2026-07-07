import React from 'react';
import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import * as api from '../services/api';

export default function MemoryScreen() {
  const [tab, setTab] = useState('facts'); // facts, people, stats
  const [facts, setFacts] = useState([]);
  const [people, setPeople] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [f, p, s] = await Promise.all([
        api.getFacts(),
        api.getPeople(),
        api.getMemoryStats(),
      ]);
      setFacts(f);
      setPeople(p);
      setStats(s);
    } catch (err) {
      console.error('Memory load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const deleteFact = async (id) => {
    await api.deleteFact(id);
    setFacts((prev) => prev.filter((f) => f.id !== id));
  };

  const tabs = [
    { key: 'facts', label: 'Facts', icon: 'brain' },
    { key: 'people', label: 'People', icon: 'people' },
    { key: 'stats', label: 'Stats', icon: 'stats-chart' },
  ];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🧠 Memory</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Ionicons name={t.icon} size={18} color={tab === t.key ? '#3b82f6' : '#64748b'} />
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {tab === 'facts' && (
        <FlatList
          data={facts}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="brain-outline" size={40} color="#334155" />
              <Text style={styles.emptyText}>No memories yet. Start chatting!</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.badge, categoryColor(item.category)]}>
                  <Text style={styles.badgeText}>{item.category}</Text>
                </View>
                {item.person_name && (
                  <Text style={styles.personName}>👤 {item.person_name}</Text>
                )}
                <TouchableOpacity onPress={() => deleteFact(item.id)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color="#64748b" />
                </TouchableOpacity>
              </View>
              <Text style={styles.cardContent}>{item.content}</Text>
              <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
            </View>
          )}
        />
      )}

      {tab === 'people' && (
        <FlatList
          data={people}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={40} color="#334155" />
              <Text style={styles.emptyText}>No people known yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.personCardHeader}>
                <Text style={styles.personNameLarge}>👤 {item.name}</Text>
                <Text style={styles.mentionCount}>{item.mention_count || item.fact_count || 0} mentions</Text>
              </View>
              {item.summary && <Text style={styles.cardContent}>{item.summary}</Text>}
              <Text style={styles.cardDate}>First seen: {formatDate(item.first_seen)}</Text>
            </View>
          )}
        />
      )}

      {tab === 'stats' && stats && (
        <ScrollView contentContainerStyle={styles.listContent}>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.totalFacts}</Text>
              <Text style={styles.statLabel}>Facts</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.totalPeople}</Text>
              <Text style={styles.statLabel}>People</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.totalConversations}</Text>
              <Text style={styles.statLabel}>Chats</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.totalMessages}</Text>
              <Text style={styles.statLabel}>Messages</Text>
            </View>
          </View>

          {stats.factsByCategory && stats.factsByCategory.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Facts by Category</Text>
              {stats.factsByCategory.map((c) => (
                <View key={c.category} style={styles.categoryRow}>
                  <Text style={styles.categoryName}>{c.category}</Text>
                  <Text style={styles.categoryCount}>{c.count}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function categoryColor(category) {
  const colors = {
    fact: '#3b82f6',
    preference: '#8b5cf6',
    opinion: '#f59e0b',
    event: '#10b981',
    person: '#ec4899',
    relationship: '#f97316',
  };
  return { backgroundColor: colors[category] || '#64748b' };
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  header: { paddingVertical: 14, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#e2e8f0' },
  tabs: { flexDirection: 'row', justifyContent: 'center', gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  tabActive: { backgroundColor: '#1e293b' },
  tabLabel: { fontSize: 14, color: '#64748b' },
  tabLabelActive: { color: '#3b82f6', fontWeight: '600' },
  listContent: { padding: 12, gap: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { color: '#475569', fontSize: 15 },
  card: { backgroundColor: '#1a1a3e', borderRadius: 12, padding: 14, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  personCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  personName: { color: '#a78bfa', fontSize: 13 },
  personNameLarge: { color: '#a78bfa', fontSize: 17, fontWeight: '600' },
  mentionCount: { color: '#64748b', fontSize: 13 },
  deleteBtn: { marginLeft: 'auto' },
  cardContent: { color: '#cbd5e1', fontSize: 14, lineHeight: 20 },
  cardDate: { color: '#475569', fontSize: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: '#1a1a3e', borderRadius: 12, padding: 16, alignItems: 'center', gap: 4 },
  statNumber: { fontSize: 28, fontWeight: '700', color: '#3b82f6' },
  statLabel: { fontSize: 13, color: '#64748b' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#e2e8f0', marginBottom: 12 },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  categoryName: { color: '#94a3b8', fontSize: 14, textTransform: 'capitalize' },
  categoryCount: { color: '#3b82f6', fontSize: 14, fontWeight: '600' },
});
