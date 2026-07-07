import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ROLES = {
  user: { bg: '#1a1a3e', align: 'flex-end', icon: 'person-circle' },
  assistant: { bg: '#1e293b', align: 'flex-start', icon: 'robot' },
  system: { bg: '#1a1a2e', align: 'center', icon: 'information-circle' },
  error: { bg: '#3b1a1a', align: 'center', icon: 'alert-circle' },
};

export default function ChatBubble({ message }) {
  const { role, content } = message;
  const config = ROLES[role] || ROLES.assistant;

  return (
    <View style={[styles.bubbleRow, { justifyContent: config.align }]}>
      {config.align === 'flex-start' && (
        <View style={styles.avatar}>
          <Ionicons name={config.icon} size={20} color="#60a5fa" />
        </View>
      )}

      <View style={[styles.bubble, { backgroundColor: config.bg, maxWidth: config.align === 'center' ? '90%' : '75%' }]}>
        <Text style={styles.text}>{content}</Text>
      </View>

      {config.align === 'flex-end' && (
        <View style={styles.avatar}>
          <Ionicons name={config.icon} size={20} color="#a78bfa" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  text: {
    color: '#e2e8f0',
    fontSize: 15,
    lineHeight: 20,
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
});
