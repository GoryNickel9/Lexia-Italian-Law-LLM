import { NewChatPanel } from "@/components/new-chat-panel";

export const dynamic = "force-dynamic";

// Schermata centrale: l'utente può iniziare subito la conversazione.
// La chat viene creata al primo invio.
export default function ChatsPage() {
  return <NewChatPanel />;
}
