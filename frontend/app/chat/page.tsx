"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { ChatApp } from "@/components/chat/ChatApp";

export default function ChatPage() {
  return (
    <AuthGuard dark>
      <ChatApp />
    </AuthGuard>
  );
}
