import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PersonaSelector({ personas, selected, onSelect }) {
  if (!personas || personas.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {personas.map((p) => {
          const isActive = selected === p.name;
          return (
            <TouchableOpacity
              key={p.name}
              style={[styles.pill, isActive && styles.pillActive]}
              onPress={() => onSelect(p.name)}
            >
              <Text style={styles.emoji}>{p.emoji}</Text>
              <Text style={[styles.label, isActive && styles.labelActive]}>{p.display_name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  scroll: {
    paddingHorizontal: 12,
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    gap: 6,
  },
  pillActive: {
    backgroundColor: '#3b82f6',
    borderWidth: 1,
    borderColor: '#60a5fa',
  },
  emoji: {
    fontSize: 16,
  },
  label: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  labelActive: {
    color: '#ffffff',
  },
});
