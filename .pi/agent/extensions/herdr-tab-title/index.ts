import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  buildTaskContext,
  isInteractiveHerdrSession,
  isSolePaneTabResponse,
  normalizeExplicitTitle,
  normalizeGeneratedTitle,
  restoreState,
  STATE_ENTRY_TYPE,
  type TabTitleState,
} from "./core.ts";

const MODEL_TIMEOUT_MS = 15_000;
const HERDR_TIMEOUT_MS = 2_000;
const TITLE_SYSTEM_PROMPT = `Create a concise semantic title for the main coding task described below.
Return only the title: 3–6 words, sentence case, no quotes, punctuation, or preamble.
Describe the task's goal, not the conversation. Infer it from both the request and the agent's work.`;

export default function herdrTabTitle(pi: ExtensionAPI) {
  const herdrEnv = process.env.HERDR_ENV;
  const tabId = process.env.HERDR_TAB_ID?.trim();
  if (herdrEnv !== "1" || !tabId) return;

  let active = false;
  let state: TabTitleState = { autoAttempted: false };
  let autoInFlight = false;
  let generation = 0;
  let modelController: AbortController | undefined;

  const persist = () => pi.appendEntry<TabTitleState>(STATE_ENTRY_TYPE, { ...state });

  const renameTab = async (title: string) => {
    try {
      const result = await pi.exec("herdr", ["tab", "rename", tabId, title], {
        timeout: HERDR_TIMEOUT_MS,
      });
      return result.code === 0;
    } catch {
      return false;
    }
  };

  const isSolePane = async () => {
    try {
      const result = await pi.exec("herdr", ["tab", "get", tabId], {
        timeout: HERDR_TIMEOUT_MS,
      });
      return result.code === 0 && isSolePaneTabResponse(result.stdout, tabId);
    } catch {
      return false;
    }
  };

  const generateTitle = async (ctx: ExtensionContext, taskContext: string) => {
    if (!ctx.model) return undefined;

    const requestGeneration = ++generation;
    modelController?.abort();
    const controller = new AbortController();
    modelController = controller;
    const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

    try {
      const response = await ctx.modelRegistry.complete(
        ctx.model,
        {
          systemPrompt: TITLE_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: `<task>\n${taskContext}\n</task>` }],
              timestamp: Date.now(),
            },
          ],
        },
        {
          cacheRetention: "none",
          maxTokens: 64,
          signal: controller.signal,
        },
      );
      if (requestGeneration !== generation || response.stopReason === "error" || response.stopReason === "aborted") {
        return undefined;
      }
      return normalizeGeneratedTitle(
        response.content
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join("\n"),
      );
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeout);
      if (modelController === controller) modelController = undefined;
    }
  };

  const autoTitle = async (ctx: ExtensionContext) => {
    if (!active || state.autoAttempted || autoInFlight) return;
    const taskContext = buildTaskContext(ctx.sessionManager.getBranch());
    if (!taskContext || !(await isSolePane()) || !active) return;

    autoInFlight = true;
    state = { ...state, autoAttempted: true };
    try {
      persist();
      const title = await generateTitle(ctx, taskContext);
      if (!title || !active) return;
      state = { autoAttempted: true, title };
      persist();
      await renameTab(title);
    } catch {
      // This integration must never affect the agent turn.
    } finally {
      autoInFlight = false;
    }
  };

  pi.on("session_start", (_event, ctx) => {
    active = isInteractiveHerdrSession({ herdrEnv, tabId, mode: ctx.mode });
    state = active
      ? restoreState(ctx.sessionManager.getEntries())
      : { autoAttempted: false };
  });

  pi.on("agent_settled", (_event, ctx) => {
    void autoTitle(ctx).catch(() => {});
  });

  pi.on("session_info_changed", async (event, ctx) => {
    if (!active || ctx.mode !== "tui") return;
    ++generation;
    modelController?.abort();
    const title = event.name ? normalizeExplicitTitle(event.name) : undefined;
    state = { autoAttempted: true, title };
    try {
      persist();
      if (title) await renameTab(title);
    } catch {
      // /name must continue to work even if the integration cannot.
    }
  });

  pi.on("session_shutdown", () => {
    active = false;
    ++generation;
    modelController?.abort();
    modelController = undefined;
  });

  pi.registerCommand("retitle-tab", {
    description: "Regenerate the Herdr tab title, or set it from the provided text",
    handler: async (args, ctx) => {
      if (!active || ctx.mode !== "tui") return;

      ++generation;
      modelController?.abort();
      const explicitTitle = normalizeExplicitTitle(args);
      const taskContext = explicitTitle
        ? undefined
        : buildTaskContext(ctx.sessionManager.getBranch());
      if (!explicitTitle && !taskContext) return;
      const title = explicitTitle ?? (await generateTitle(ctx, taskContext!));
      if (!title) return;

      state = { autoAttempted: true, title };
      try {
        persist();
        if (await renameTab(title)) ctx.ui.notify(`Herdr tab: ${title}`, "info");
      } catch {
        // Explicit retitling also fails quietly when Pi or Herdr is shutting down.
      }
    },
  });
}
