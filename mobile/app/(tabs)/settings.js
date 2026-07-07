import React from 'react';
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import * as api from '../services/api';

export default function SettingsScreen() {
  const [serverUrl, setServerUrl] = useState('');
  const [userName, setUserName] = useState('');
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.getBaseUrl().then(setServerUrl);
    api.getProfile().then((p) => { if (p?.name) setUserName(p.name); });
    api.checkHealth().then(setHealth);
  }, []);

  const saveServerUrl = async () => {
    try {
      await api.setBaseUrl(serverUrl);
      const h = await api.checkHealth();
      setHealth(h);
      Alert.alert('Saved', 'Server URL updated.');
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const saveName = async () => {
    try {
      await api.updateProfile({ name: userName });
      Alert.alert('Saved', 'Name updated. Baymax will remember this.');
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚙️ Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Server Connection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Server Connection</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="http://localhost:3200"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TouchableOpacity style={styles.btn} onPress={saveServerUrl}>
              <Text style={styles.btnText}>Save</Text>
            </TouchableOpacity>
          </View>

          {health && (
            <View style={styles.healthRow}>
              <View style={[styles.healthDot, { backgroundColor: health.ollama?.ok ? '#22c55e' : '#ef4444' }]} />
              <Text style={styles.healthText}>
                Ollama: {health.ollama?.ok ? 'Connected' : 'Not connected'}
              </Text>
              {health.ollama?.models && (
                <Text style={styles.healthModels}>Models: {health.ollama.models.join(', ')}</Text>
              )}
            </View>
          )}
        </View>

        {/* Profile */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Profile</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={userName}
              onChangeText={setUserName}
              placeholder="What should Baymax call you?"
              placeholderTextColor="#475569"
            />
            <TouchableOpacity style={styles.btn} onPress={saveName}>
              <Text style={styles.btnText}>Save</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>This helps Baymax personalize responses.</Text>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.aboutText}>
            Baymax v1.0.0{'\n'}
            Your personal AI companion with deep memory.{'\n\n'}
            Baymax remembers your conversations, learns about your life, and adapts to your needs.
            All data stays on your device and server — fully private, fully yours.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  header: { paddingVertical: 14, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#e2e8f0' },
  content: { padding: 16, gap: 20 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#94a3b8', marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#1a1a3e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#e2e8f0',
    fontSize: 15,
  },
  btn: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  healthDot: { width: 10, height: 10, borderRadius: 5 },
  healthText: { color: '#94a3b8', fontSize: 14 },
  healthModels: { color: '#475569', fontSize: 12, marginTop: 2 },
  hint: { color: '#475569', fontSize: 13 },
  aboutText: { color: '#64748b', fontSize: 14, lineHeight: 20 },
});
