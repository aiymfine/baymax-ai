import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function CheckInBanner({ checkIns, onOpen, onDismiss }) {
  if (!checkIns || checkIns.length === 0) return null;

  const latest = checkIns[0];
  const count = checkIns.length;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onOpen(latest)}
      activeOpacity={0.8}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="sparkles" size={18} color="#a78bfa" />
        {count > 1 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count}</Text>
          </View>
        )}
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{latest.message}</Text>
        <Text style={styles.time}>{formatTime(latest.created_at)}</Text>
      </View>
      <TouchableOpacity style={styles.dismiss} onPress={(e) => { e.stopPropagation?.(); onDismiss(latest.id); }}>
        <Ionicons name="close" size={18} color="#475569" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso + 'Z');
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 4,
    padding: 12,
    backgroundColor: '#1a1333',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#a78bfa33',
  },
  iconWrap: {
    position: 'relative',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#a78bfa22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#a78bfa',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 18,
  },
  time: {
    color: '#64748b',
    fontSize: 11,
  },
  dismiss: {
    padding: 4,
  },
});
