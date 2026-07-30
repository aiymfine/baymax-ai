import React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as api from '../services/api';

const MOOD_CONFIG = {
  happy: { emoji: '😄', color: '#22c55e', label: 'Happy' },
  excited: { emoji: '🤩', color: '#f59e0b', label: 'Excited' },
  calm: { emoji: '😌', color: '#3b82f6', label: 'Calm' },
  neutral: { emoji: '😐', color: '#64748b', label: 'Neutral' },
  sad: { emoji: '😢', color: '#6366f1', label: 'Sad' },
  anxious: { emoji: '😰', color: '#a855f7', label: 'Anxious' },
  frustrated: { emoji: '😤', color: '#ef4444', label: 'Frustrated' },
  tired: { emoji: '🥱', color: '#8b5cf6', label: 'Tired' },
  grateful: { emoji: '🙏', color: '#10b981', label: 'Grateful' },
  stressed: { emoji: '😣', color: '#f97316', label: 'Stressed' },
};

function getMoodConfig(mood) {
  const key = (mood || '').toLowerCase().trim();
  return MOOD_CONFIG[key] || { emoji: '❓', color: '#64748b', label: mood || 'Unknown' };
}

export default function MoodScreen() {
  const [timeline, setTimeline] = useState([]);
  const [insights, setInsights] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [tl, ins, st] = await Promise.all([
        api.getMoodTimeline(30).catch(() => []),
        api.getMoodInsights().catch(() => null),
        api.getMoodStats(30).catch(() => null),
      ]);
      setTimeline(tl);
      setInsights(ins);
      setStats(st);
    } catch (err) {
      console.error('Mood load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  // Build mood streak visualization
  const renderMoodBars = () => {
    if (!stats?.distribution || stats.distribution.length === 0) return null;

    const maxCount = Math.max(...stats.distribution.map((d) => d.count));

    return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📊 Mood Distribution</Text>
        <View style={styles.barsContainer}>
          {stats.distribution.map((item, i) => {
            const cfg = getMoodConfig(item.mood);
            const heightPct = (item.count / maxCount) * 100;
            return (
              <View key={i} style={styles.barItem}>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, {
                    height: `${Math.max(heightPct, 8)}%`,
                    backgroundColor: cfg.color,
                  }]} />
                </View>
                <Text style={styles.barEmoji}>{cfg.emoji}</Text>
                <Text style={styles.barCount}>{item.count}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // Timeline as colored dots
  const renderTimeline = () => {
    if (timeline.length === 0) return null;

    return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📅 Mood Timeline</Text>
        <View style={styles.timelineRow}>
          {timeline.slice(0, 14).reverse().map((item, i) => {
            const cfg = getMoodConfig(item.mood);
            return (
              <View key={i} style={styles.timelineDotWrap}>
                <TouchableOpacity style={[styles.timelineDot, { backgroundColor: cfg.color }]}>
                  <Text style={styles.timelineEmoji}>{cfg.emoji}</Text>
                </TouchableOpacity>
                <Text style={styles.timelineDate}>{formatShortDate(item.date)}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderDailyList = () => {
    if (timeline.length === 0) return null;

    return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📖 Daily Logs</Text>
        {timeline.map((item, i) => {
          const cfg = getMoodConfig(item.mood);
          let topics = [];
          try { topics = typeof item.topics === 'string' ? JSON.parse(item.topics) : (item.topics || []); } catch {}
          return (
            <View key={i} style={styles.logItem}>
              <View style={styles.logHeader}>
                <TouchableOpacity style={[styles.moodPill, { backgroundColor: cfg.color + '33', borderColor: cfg.color }]}>
                  <Text style={styles.moodPillEmoji}>{cfg.emoji}</Text>
                  <Text style={[styles.moodPillText, { color: cfg.color }]}>{cfg.label}</Text>
                </TouchableOpacity>
                <Text style={styles.logDate}>{formatDate(item.date)}</Text>
                <Text style={styles.logCount}>{item.message_count} msgs</Text>
              </View>
              {item.summary ? <Text style={styles.logSummary}>{item.summary}</Text> : null}
              {topics.length > 0 && (
                <View style={styles.topicsRow}>
                  {topics.map((t, j) => (
                    <View key={j} style={styles.topicPill}>
                      <Text style={styles.topicText}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📊 Mood</Text>
        </View>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>📊 Mood</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
      >
        {/* Insights Card */}
        {insights && (
          <View style={[styles.card, styles.insightCard]}>
            <View style={styles.insightHeader}>
              <Ionicons name="bulb" size={20} color="#a78bfa" />
              <Text style={styles.insightTitle}>Insights</Text>
            </View>
            <Text style={styles.insightText}>{insights.insights}</Text>
            {insights.mostFrequentMood && insights.total > 2 && (
              <View style={styles.insightStat}>
                <Text style={styles.insightStatLabel}>Most common lately:</Text>
                <Text style={styles.insightStatValue}>
                  {getMoodConfig(insights.mostFrequentMood).emoji} {getMoodConfig(insights.mostFrequentMood).label}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Mood Distribution Bars */}
        {renderMoodBars()}

        {/* Timeline Dots */}
        {renderTimeline()}

        {/* Daily Logs */}
        {renderDailyList()}

        {/* Empty State */}
        {timeline.length === 0 && (
          <View style={styles.centerState}>
            <Ionicons name="bar-chart-outline" size={56} color="#334155" />
            <Text style={styles.emptyTitle}>No mood data yet</Text>
            <Text style={styles.emptyText}>
              Chat with your AI for a few days and mood patterns will appear here.
              {'\n'}Each day with 5+ messages gets a mood summary.
            </Text>
          </View>
        )}

        {/* Stats footer */}
        {stats && stats.totalDays > 0 && (
          <Text style={styles.footerText}>
            📅 {stats.totalDays} days tracked · {timeline.length} summaries
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function formatShortDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { day: 'numeric' });
  } catch { return ''; }
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return iso; }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  header: { paddingVertical: 14, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#e2e8f0' },
  content: { padding: 14, gap: 12 },
  centerState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { color: '#64748b', fontSize: 18, fontWeight: '600' },
  emptyText: { color: '#475569', fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 30 },
  card: {
    backgroundColor: '#1a1a3e',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  insightCard: {
    borderWidth: 1,
    borderColor: '#a78bfa33',
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  insightTitle: {
    color: '#a78bfa',
    fontSize: 16,
    fontWeight: '700',
  },
  insightText: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 21,
  },
  insightStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  insightStatLabel: { color: '#64748b', fontSize: 13 },
  insightStatValue: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  sectionTitle: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 120,
    paddingVertical: 8,
  },
  barItem: { alignItems: 'center', gap: 4, flex: 1 },
  barTrack: { width: 24, height: 80, justifyContent: 'flex-end', alignItems: 'center' },
  barFill: { width: '100%', borderRadius: 6, minHeight: 4 },
  barEmoji: { fontSize: 14 },
  barCount: { color: '#64748b', fontSize: 11, fontWeight: '600' },
  timelineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  timelineDotWrap: { alignItems: 'center', gap: 3 },
  timelineDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineEmoji: { fontSize: 14 },
  timelineDate: { color: '#475569', fontSize: 9 },
  logItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 6,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  moodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  moodPillEmoji: { fontSize: 13 },
  moodPillText: { fontSize: 12, fontWeight: '600' },
  logDate: { color: '#94a3b8', fontSize: 13 },
  logCount: { color: '#475569', fontSize: 12, marginLeft: 'auto' },
  logSummary: { color: '#cbd5e1', fontSize: 14, lineHeight: 19 },
  topicsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  topicPill: { backgroundColor: '#1e293b', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  topicText: { color: '#94a3b8', fontSize: 11 },
  footerText: { color: '#475569', fontSize: 12, textAlign: 'center', paddingTop: 8 },
});
