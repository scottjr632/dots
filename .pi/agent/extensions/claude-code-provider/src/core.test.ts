import assert from "node:assert/strict";
import test from "node:test";
import type { Context } from "@earendil-works/pi-ai";
import {
  buildClaudePrompt,
  claudeEnvironment,
  claudeReasoning,
  parseClaudeSubscriptionStatus,
  toolResultPreview,
} from "./core.ts";

const user = (content: string) => ({ role: "user" as const, content, timestamp: 1 });

test("fresh Claude sessions receive prior pi conversation as a handoff", () => {
  const context: Context = {
    messages: [
      user("first question"),
      {
        role: "assistant",
        content: [{ type: "text", text: "first answer" }],
        api: "test",
        provider: "test",
        model: "test",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: 2,
      },
      user("second question"),
    ],
  };

  const prompt = buildClaudePrompt(context);
  assert.match(prompt, /prior_transcript/);
  assert.match(prompt, /user: first question/);
  assert.match(prompt, /assistant: first answer/);
  assert.match(prompt, /user: second question/);
});

test("resumed Claude sessions receive only the newest user turn", () => {
  const context: Context = { messages: [user("old"), user("new")] };
  assert.equal(buildClaudePrompt(context, "session-id"), "new");
});

test("Claude subprocess environment cannot fall back to billable API credentials", () => {
  const env = claudeEnvironment({
    PATH: "/bin",
    ANTHROPIC_API_KEY: "secret",
    ANTHROPIC_AUTH_TOKEN: "secret",
    CLAUDE_CODE_USE_BEDROCK: "1",
  });
  assert.equal(env.PATH, "/bin");
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, undefined);
  assert.equal(env.CLAUDE_CODE_USE_BEDROCK, undefined);
});

test("authentication must explicitly be a Claude subscription", () => {
  assert.deepEqual(
    parseClaudeSubscriptionStatus(
      JSON.stringify({ loggedIn: true, authMethod: "claude.ai", subscriptionType: "max" }),
    ),
    { authMethod: "claude.ai", subscriptionType: "max" },
  );
  assert.throws(
    () =>
      parseClaudeSubscriptionStatus(
        JSON.stringify({ loggedIn: true, authMethod: "api_key", subscriptionType: null }),
      ),
    /must use a claude.ai subscription/,
  );
});

test("tool result previews flatten SDK text blocks", () => {
  assert.equal(
    toolResultPreview([
      { type: "text", text: "first" },
      { type: "text", text: "second" },
    ]),
    "first\nsecond",
  );
});

test("pi reasoning levels map to Claude Code effort", () => {
  assert.deepEqual(claudeReasoning("off"), { thinking: { type: "disabled" } });
  assert.deepEqual(claudeReasoning("minimal"), {
    thinking: { type: "adaptive" },
    effort: "low",
  });
  assert.deepEqual(claudeReasoning("max"), {
    thinking: { type: "adaptive" },
    effort: "max",
  });
});
