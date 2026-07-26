import React from 'react';
import { Slot } from 'expo-router';
import { ChatProvider } from '../hooks/useChat';

export default function RootLayout() {
  return (
    <ChatProvider>
      <Slot />
    </ChatProvider>
  );
}
