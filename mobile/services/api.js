// ─────────────────────────────────────────────────
// API Client — Talks to Baymax Server
// ─────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'baymax_server_url';

async function getBaseUrl() {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return stored || 'http://localhost:3200';
}

async function setBaseUrl(url) {
  await AsyncStorage.setItem(STORAGE_KEY, url);
}

async function request(endpoint, options = {}) {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/api${endpoint}`;

  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ── Chat ─────────────────────────────────────────
export async function sendMessage({ message, persona, conversationId }) {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, persona, conversationId }),
  });
}

export async function getConversations() {
  return request('/chat/conversations');
}

export async function getConversation(id) {
  return request(`/chat/conversations/${id}`);
}

export async function deleteConversation(id) {
  return request(`/chat/conversations/${id}`, { method: 'DELETE' });
}

// ── Memory ───────────────────────────────────────
export async function getFacts(options = {}) {
  const params = new URLSearchParams();
  if (options.category) params.set('category', options.category);
  if (options.personName) params.set('personName', options.personName);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/memory/facts${query}`);
}

export async function deleteFact(id) {
  return request(`/memory/facts/${id}`, { method: 'DELETE' });
}

export async function getPeople() {
  return request('/memory/people');
}

export async function getProfile() {
  return request('/memory/profile');
}

export async function updateProfile(data) {
  return request('/memory/profile', { method: 'PUT', body: JSON.stringify(data) });
}

export async function getMemoryStats() {
  return request('/memory/stats');
}

// ── Personas ─────────────────────────────────────
export async function getPersonas() {
  return request('/personas');
}

export async function createPersona(data) {
  return request('/personas', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Health ───────────────────────────────────────
export async function checkHealth() {
  try {
    return await request('/health');
  } catch {
    return { status: 'error', ollama: { ok: false } };
  }
}

// ── Config ──────────────────────────────────────
export { getBaseUrl, setBaseUrl };
