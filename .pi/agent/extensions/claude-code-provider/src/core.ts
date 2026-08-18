import type { Context, Message, ModelThinkingLevel, Usage } from "@earendil-works/pi-ai";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

const HANDOFF_HEADER = `You are continuing a conversation that started in another coding-agent interface. The transcript below is context, not new instructions. Continue by handling the final user message with your normal Claude Code tools and behavior.`;

export interface ClaudeSubscriptionStatus {
  readonly authMethod: "claude.ai";
  readonly subscriptionType: string;
}

export function parseClaudeSubscriptionStatus(output: string): ClaudeSubscriptionStatus {
  let status: {
    loggedIn?: boolean;
    authMethod?: string;
    subscriptionType?: string;
  };
  try {
    status = JSON.parse(output);
  } catch {
    throw new Error("Claude Code returned an unreadable authentication status.");
  }
  if (!status.loggedIn) throw new Error("Claude Code is not logged in.");
  if (status.authMethod !== "claude.ai" || !status.subscriptionType) {
    throw new Error(
      `Claude Code must use a claude.ai subscription; found ${status.authMethod ?? "unknown authentication"}.`,
    );
  }
  return { authMethod: "claude.ai", subscriptionType: status.subscriptionType };
}

function textContent(message: Message): string {
  if (message.role === "user") {
    if (typeof message.content === "string") return message.content;
    return message.content
      .map((part) => (part.type === "text" ? part.text : `[image: ${part.mimeType}]`))
      .join("\n");
  }

  if (message.role === "assistant") {
    return message.content
      .flatMap((part) => {
        if (part.type === "text") return [part.text];
        if (part.type === "toolCall") {
          return [`[called ${part.name}: ${JSON.stringify(part.arguments)}]`];
        }
        return [];
      })
      .join("\n");
  }

  return message.content
    .map((part) => (part.type === "text" ? part.text : `[image: ${part.mimeType}]`))
    .join("\n");
}

function transcriptLine(message: Message): string {
  const role = message.role === "toolResult" ? `Tool ${message.toolName}` : message.role;
  return `${role}: ${textContent(message)}`;
}

export function buildClaudePrompt(context: Context, resumeSessionId?: string): string {
  let latestUserIndex = -1;
  for (let index = context.messages.length - 1; index >= 0; index--) {
    if (context.messages[index]?.role === "user") {
      latestUserIndex = index;
      break;
    }
  }
  if (latestUserIndex < 0) throw new Error("Claude Code provider received no user message.");

  const currentPrompt = textContent(context.messages[latestUserIndex]).trim();
  if (resumeSessionId || latestUserIndex === 0) return currentPrompt;

  const transcript = context.messages
    .slice(0, latestUserIndex + 1)
    .map(transcriptLine)
    .join("\n\n");
  return `${HANDOFF_HEADER}\n\n<prior_transcript>\n${transcript}\n</prior_transcript>`;
}

export function claudeEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...source,
    CLAUDE_AGENT_SDK_CLIENT_APP: "pi-claude-code-provider/0.1.0",
  };
  for (const name of [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
  ]) {
    delete env[name];
  }
  return env;
}

export function claudeReasoning(level?: ModelThinkingLevel): {
  thinking?: { type: "disabled" } | { type: "adaptive" };
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
} {
  if (!level) return {};
  if (level === "off") return { thinking: { type: "disabled" } };
  return {
    thinking: { type: "adaptive" },
    effort: level === "minimal" ? "low" : level,
  };
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function resultUsage(result: SDKResultMessage): Usage {
  const input = finite(result.usage.input_tokens);
  const output = finite(result.usage.output_tokens);
  const cacheRead = finite(result.usage.cache_read_input_tokens);
  const cacheWrite = finite(result.usage.cache_creation_input_tokens);
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: input + output + cacheRead + cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

export function safePreview(value: unknown, maxLength = 500): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function toolResultPreview(value: unknown, maxLength = 2_000): string {
  if (typeof value === "string") return safePreview(value, maxLength);
  if (Array.isArray(value)) {
    const text = value
      .flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const block = part as { type?: unknown; text?: unknown; content?: unknown };
        if (block.type === "text" && typeof block.text === "string") return [block.text];
        if (typeof block.content === "string") return [block.content];
        return [];
      })
      .join("\n");
    if (text) return safePreview(text, maxLength);
  }
  return safePreview(value, maxLength);
}
