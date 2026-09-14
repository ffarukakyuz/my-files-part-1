import { askSupport } from "./support-chat.functions";

type Message = { role: "user" | "assistant"; content: string };

export async function askGemini(messages: Message[]): Promise<string> {
  const result = await askSupport({ messages });
  return result.ok ? result.reply : result.reply;
}
