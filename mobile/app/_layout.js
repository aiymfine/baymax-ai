import React from 'react';
import { Slot } from 'expo-router';
import { ChatProvider } from '../hooks/useChat';
import ErrorBoundary from '../components/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <ChatProvider>
        <Slot />
      </ChatProvider>
    </ErrorBoundary>
  );
}
