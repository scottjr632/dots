import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import type {
  CanUseTool,
  SDKAssistantMessage,
  SDKMessage,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
  buildClaudePrompt,
  claudeEnvironment,
  claudeReasoning,
  parseClaudeSubscriptionStatus,
  resultUsage,
  safePreview,
  toolResultPreview,
} from "./src/core.ts";

const PROVIDER = "claude-code";
const API = "claude-code-agent";
const SESSION_ENTRY = "claude-code-provider-session";
const TOOL_ENTRY = "claude-code-provider-tool";
const BILLING_WARNING =
  "Claude Code—not pi—will run the agent and its tools, so pi tool controls do not apply. This uses your Claude login and strips API credentials, but Anthropic controls billing. Disable Extra Usage in Claude settings; overage detection is fail-safe, not a guarantee that no request can be charged.";

interface StoredSession {
  readonly sessionId: string | null;
  readonly cwd: string;
  readonly model: string;
}

interface ClaudeToolEntry {
  readonly phase: "start" | "result";
  readonly toolId: string;
  readonly name: string;
  readonly preview?: string;
  readonly isError?: boolean;
  readonly parentToolUseId?: string;
}

interface RuntimeContext {
  cwd: string;
  projectTrusted: boolean;
  authVerified: boolean;
  warningAccepted: boolean;
  ui?: ExtensionUIContext;
  resumeSessionId?: string;
}

function resolveClaudeBinary(): string | undefined {
  const names = process.platform === "win32" ? ["claude.exe", "claude.cmd", "claude"] : ["claude"];
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    for (const name of names) {
      const candidate = path.join(directory, name);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // Keep searching PATH.
      }
    }
  }
  return undefined;
}

function verifySubscriptionAuth(claudeBinary: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      claudeBinary,
      ["auth", "status"],
      { encoding: "utf8", env: claudeEnvironment(), timeout: 10_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        try {
          parseClaudeSubscriptionStatus(stdout);
          resolve();
        } catch (cause) {
          reject(cause);
        }
      },
    );
  });
}

function storedSession(ctx: ExtensionContext): string | undefined {
  const branch = ctx.sessionManager.getBranch();
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry.type !== "custom" || entry.customType !== SESSION_ENTRY) continue;
    const data = entry.data as Partial<StoredSession> | undefined;
    if (data?.cwd !== ctx.cwd) continue;
    return typeof data.sessionId === "string" ? data.sessionId : undefined;
  }
  return undefined;
}

function makePermissionHandler(getRuntime: () => RuntimeContext): CanUseTool {
  return async (toolName, input, options) => {
    const runtime = getRuntime();
    if (!runtime.ui) {
      return {
        behavior: "deny",
        message: `Claude Code requested ${toolName}, but pi has no interactive UI for approval.`,
      };
    }

    const title = options.title ?? `Claude Code wants to use ${toolName}`;
    const detail = [options.description, options.decisionReason, safePreview(input)]
      .filter(Boolean)
      .join("\n\n");
    const choices = ["Allow once", ...(options.suggestions?.length ? ["Allow for session"] : []), "Deny"];
    const choice = await runtime.ui.select(`${title}\n\n${detail}`, choices, {
      signal: options.signal,
    });
    if (choice === "Allow once") return { behavior: "allow", updatedInput: input };
    if (choice === "Allow for session") {
      return {
        behavior: "allow",
        updatedInput: input,
        updatedPermissions: options.suggestions,
      };
    }
    return { behavior: "deny", message: `User denied ${toolName}.` };
  };
}

function createClaudeStream(options: {
  claudeBinary: string;
  getRuntime: () => RuntimeContext;
  onSession: (session: StoredSession) => void;
  onToolEvent: (event: ClaudeToolEntry) => void;
}) {
  const canUseTool = makePermissionHandler(options.getRuntime);

  return (
    model: Model<any>,
    context: Context,
    streamOptions?: SimpleStreamOptions,
  ) => {
    const stream = createAssistantMessageEventStream();

    void (async () => {
      const runtime = options.getRuntime();
      const abortController = new AbortController();
      const onAbort = () => abortController.abort();
      streamOptions?.signal?.addEventListener("abort", onAbort, { once: true });

      const output: AssistantMessage = {
        role: "assistant",
        content: [],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "pending",
        timestamp: Date.now(),
      };

      let activeBlock: { index: number; kind: "text" | "thinking" } | undefined;
      let emittedText = false;
      let responseHadDelta = false;
      let result: SDKResultMessage | undefined;
      let nativeQuery: ReturnType<typeof query> | undefined;
      const nativeTools = new Map<
        string,
        { name: string; parentToolUseId?: string }
      >();

      const closeBlock = () => {
        if (!activeBlock) return;
        const { index, kind } = activeBlock;
        const block = output.content[index];
        if (kind === "text" && block?.type === "text") {
          stream.push({ type: "text_end", contentIndex: index, content: block.text, partial: output });
        } else if (kind === "thinking" && block?.type === "thinking") {
          stream.push({
            type: "thinking_end",
            contentIndex: index,
            content: block.thinking,
            partial: output,
          });
        }
        activeBlock = undefined;
      };

      const appendDelta = (kind: "text" | "thinking", delta: string) => {
        if (!delta) return;
        if (activeBlock?.kind !== kind) {
          closeBlock();
          const index = output.content.length;
          if (kind === "text") {
            output.content.push({ type: "text", text: "" });
            stream.push({ type: "text_start", contentIndex: index, partial: output });
          } else {
            output.content.push({ type: "thinking", thinking: "" });
            stream.push({ type: "thinking_start", contentIndex: index, partial: output });
          }
          activeBlock = { index, kind };
        }

        const block = output.content[activeBlock.index];
        if (kind === "text" && block.type === "text") {
          block.text += delta;
          emittedText = true;
          stream.push({ type: "text_delta", contentIndex: activeBlock.index, delta, partial: output });
        } else if (kind === "thinking" && block.type === "thinking") {
          block.thinking += delta;
          stream.push({ type: "thinking_delta", contentIndex: activeBlock.index, delta, partial: output });
        }
      };

      const appendAssistantFallback = (message: SDKAssistantMessage) => {
        if (responseHadDelta) return;
        for (const block of message.message.content) {
          if (block.type === "text") appendDelta("text", block.text);
          else if (block.type === "thinking") appendDelta("thinking", block.thinking);
        }
        closeBlock();
      };

      const handleMessage = (message: SDKMessage) => {
        if (message.type === "system" && message.subtype === "init") {
          output.responseModel = message.model;
          return;
        }
        if (message.type === "rate_limit_event") {
          if (message.rate_limit_info.isUsingOverage || message.rate_limit_info.overageInUse) {
            abortController.abort();
            throw new Error(
              "Claude Code reported that extra usage is active. Disable extra usage in Claude settings to guarantee this provider only uses plan allowance.",
            );
          }
          return;
        }
        if (message.type === "stream_event") {
          if (message.parent_tool_use_id !== null) return;
          const event = message.event;
          if (event.type === "message_start") {
            responseHadDelta = false;
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") {
              responseHadDelta = true;
              appendDelta("text", event.delta.text);
            } else if (event.delta.type === "thinking_delta") {
              responseHadDelta = true;
              appendDelta("thinking", event.delta.thinking);
            }
          } else if (event.type === "content_block_stop") {
            closeBlock();
          }
          return;
        }
        if (message.type === "assistant") {
          const parentToolUseId = message.parent_tool_use_id ?? undefined;
          for (const block of message.message.content) {
            if (block.type !== "tool_use" || nativeTools.has(block.id)) continue;
            nativeTools.set(block.id, { name: block.name, parentToolUseId });
            options.onToolEvent({
              phase: "start",
              toolId: block.id,
              name: block.name,
              preview: safePreview(block.input, 2_000),
              parentToolUseId,
            });
            runtime.ui?.setStatus(PROVIDER, `Claude Code: ${block.name}`);
          }
          if (message.parent_tool_use_id !== null) return;
          output.responseModel = message.message.model;
          appendAssistantFallback(message);
          return;
        }
        if (message.type === "user" && Array.isArray(message.message.content)) {
          for (const block of message.message.content) {
            if (block.type !== "tool_result") continue;
            const tool = nativeTools.get(block.tool_use_id);
            options.onToolEvent({
              phase: "result",
              toolId: block.tool_use_id,
              name: tool?.name ?? "Tool",
              preview: toolResultPreview(block.content),
              isError: block.is_error ?? false,
              parentToolUseId: tool?.parentToolUseId,
            });
            nativeTools.delete(block.tool_use_id);
          }
          if (message.parent_tool_use_id === null) {
            runtime.ui?.setStatus(PROVIDER, "Claude Code: working");
          }
          return;
        }
        if (message.type === "result") result = message;
      };

      try {
        stream.push({ type: "start", partial: output });
        if (!runtime.authVerified) {
          await verifySubscriptionAuth(options.claudeBinary);
          runtime.authVerified = true;
        }
        if (!runtime.warningAccepted) {
          if (runtime.ui) {
            const accepted = await runtime.ui.confirm(
              "Claude Code subscription provider",
              BILLING_WARNING,
            );
            if (!accepted) throw new Error("Claude Code provider use was cancelled.");
          } else {
            console.error(`[${PROVIDER}] WARNING: ${BILLING_WARNING}`);
          }
          runtime.warningAccepted = true;
        }

        const prompt = buildClaudePrompt(context, runtime.resumeSessionId);
        nativeQuery = query({
          prompt,
          options: {
            cwd: runtime.cwd,
            model: model.id,
            pathToClaudeCodeExecutable: options.claudeBinary,
            env: claudeEnvironment(),
            settingSources: runtime.projectTrusted ? ["user", "project", "local"] : ["user"],
            includePartialMessages: true,
            permissionMode: "default",
            canUseTool,
            abortController,
            ...(runtime.resumeSessionId
              ? { resume: runtime.resumeSessionId, forkSession: true }
              : {}),
            ...claudeReasoning(streamOptions?.reasoning),
          },
        });

        for await (const message of nativeQuery) handleMessage(message);
        closeBlock();
        if (!result) throw new Error("Claude Code ended without a result.");
        if (result.subtype !== "success") {
          const message = result.errors.filter(Boolean).join("\n") || result.stop_reason || result.subtype;
          throw new Error(message);
        }
        if (!emittedText && result.result.trim()) appendDelta("text", result.result);
        closeBlock();
        output.usage = resultUsage(result);
        output.stopReason = "stop";
        options.onSession({ sessionId: result.session_id, cwd: runtime.cwd, model: model.id });
        stream.push({ type: "done", reason: "stop", message: output });
        stream.end();
      } catch (error) {
        closeBlock();
        output.stopReason = streamOptions?.signal?.aborted ? "aborted" : "error";
        output.errorMessage = error instanceof Error ? error.message : String(error);
        stream.push({ type: "error", reason: output.stopReason, error: output });
        stream.end();
      } finally {
        runtime.ui?.setStatus(PROVIDER, undefined);
        streamOptions?.signal?.removeEventListener("abort", onAbort);
        nativeQuery?.close();
      }
    })();

    return stream;
  };
}

export default function (pi: ExtensionAPI) {
  const claudeBinary = resolveClaudeBinary();
  if (!claudeBinary) return;

  let runtime: RuntimeContext = {
    cwd: process.cwd(),
    projectTrusted: false,
    authVerified: false,
    warningAccepted: false,
  };
  let pendingSession: StoredSession | undefined;

  const streamSimple = createClaudeStream({
    claudeBinary,
    getRuntime: () => runtime,
    onSession: (session) => {
      pendingSession = session;
    },
    onToolEvent: (event) => {
      pi.appendEntry<ClaudeToolEntry>(TOOL_ENTRY, event);
    },
  });

  pi.registerEntryRenderer(TOOL_ENTRY, (entry, { expanded }, theme) => {
    const event = entry.data as ClaudeToolEntry;
    const nested = event.parentToolUseId ? theme.fg("dim", " · subagent") : "";
    const preview = event.preview?.trim();
    const compactPreview = preview?.replace(/\s+/g, " ");
    if (event.phase === "start") {
      let text = `${theme.fg("toolTitle", theme.bold(`Claude Code · ${event.name}`))}${nested}`;
      if (preview) text += `\n${theme.fg("dim", expanded ? preview : compactPreview!)}`;
      return new Text(text, 0, 0);
    }

    const glyph = event.isError
      ? theme.fg("error", "✗")
      : theme.fg("success", "✓");
    let text = `${glyph} ${theme.fg("muted", event.name)}${nested}`;
    if (preview) text += `\n${theme.fg(event.isError ? "error" : "dim", expanded ? preview : compactPreview!)}`;
    return new Text(text, 0, 0);
  });

  pi.registerProvider(PROVIDER, {
    name: "Claude Code (subscription)",
    baseUrl: "claude-code://local",
    apiKey: "claude-code-local",
    api: API,
    streamSimple,
    models: [
      {
        id: "opus",
        name: "Claude Code Opus",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200_000,
        maxTokens: 64_000,
        thinkingLevelMap: {
          minimal: "low",
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "xhigh",
          max: "max",
        },
      },
      {
        id: "sonnet",
        name: "Claude Code Sonnet",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200_000,
        maxTokens: 64_000,
        thinkingLevelMap: {
          minimal: "low",
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "xhigh",
          max: "max",
        },
      },
    ],
  });

  pi.on("session_start", (_event, ctx) => {
    runtime = {
      cwd: ctx.cwd,
      projectTrusted: ctx.isProjectTrusted(),
      authVerified: false,
      warningAccepted: false,
      ui: ctx.hasUI ? ctx.ui : undefined,
      resumeSessionId: storedSession(ctx),
    };
  });

  pi.on("model_select", (event, ctx) => {
    if (event.model.provider !== PROVIDER) return;
    ctx.ui.notify(BILLING_WARNING, "warning");
  });

  pi.on("context", (_event, ctx) => {
    if (ctx.model?.provider !== PROVIDER) return;
    runtime.resumeSessionId = storedSession(ctx);
  });

  pi.on("agent_end", () => {
    if (!pendingSession) return;
    pi.appendEntry<StoredSession>(SESSION_ENTRY, pendingSession);
    runtime.resumeSessionId = pendingSession.sessionId ?? undefined;
    pendingSession = undefined;
  });

  pi.on("session_shutdown", () => {
    runtime.ui?.setStatus(PROVIDER, undefined);
    runtime.ui = undefined;
    pendingSession = undefined;
  });

  pi.registerCommand("claude-code-new", {
    description: "Start a fresh Claude Code subscription session on the next turn",
    handler: async (_args, ctx) => {
      pi.appendEntry<StoredSession>(SESSION_ENTRY, {
        sessionId: null,
        cwd: ctx.cwd,
        model: ctx.model?.id ?? "opus",
      });
      runtime.resumeSessionId = undefined;
      ctx.ui.notify("The next Claude Code turn will start a fresh session.", "info");
    },
  });

  pi.registerCommand("claude-code-status", {
    description: "Show Claude Code subscription authentication status",
    handler: async (_args, ctx) => {
      const result = await pi.exec(claudeBinary, ["auth", "status"], { timeout: 10_000 });
      if (result.code !== 0) {
        ctx.ui.notify(result.stderr.trim() || "Claude Code authentication check failed.", "error");
        return;
      }
      try {
        const status = parseClaudeSubscriptionStatus(result.stdout);
        ctx.ui.notify(
          `Claude Code: ${status.authMethod}, ${status.subscriptionType}`,
          "info",
        );
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
      }
    },
  });
}
