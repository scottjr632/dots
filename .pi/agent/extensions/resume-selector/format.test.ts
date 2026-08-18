import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildPreview,
	cleanOneLine,
	derivePromptLabel,
	extractModelFromSessionText,
	filterAndSortSessions,
	formatModelRef,
	formatRelativeTime,
	fuzzyScore,
	hasSessionName,
	prettifyPath,
	sanitizeTerminalText,
	searchHaystack,
	type SessionRecord,
} from "./src/format.ts";

function makeRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
	return {
		path: "/sessions/a.jsonl",
		id: "abc123",
		cwd: "/home/user/project",
		created: new Date("2024-01-01T00:00:00Z"),
		modified: new Date("2024-01-01T00:00:00Z"),
		messageCount: 3,
		firstMessage: "Fix the login bug",
		allMessagesText: "Fix the login bug and add tests",
		...overrides,
	};
}

test("sanitizeTerminalText strips control and escape sequences", () => {
	const input =
		"safe\u001b]52;c;evil\u0007text\u001b[31mred\u001b[0m\u0001done";
	assert.equal(sanitizeTerminalText(input), "safetextreddone");
});

test("cleanOneLine collapses whitespace and newlines", () => {
	assert.equal(cleanOneLine("  hello\n\tworld  \r\nagain "), "hello world again");
});

test("formatRelativeTime buckets durations", () => {
	const now = new Date("2024-06-15T12:00:00Z");
	const at = (ms: number) => new Date(now.getTime() - ms);
	assert.equal(formatRelativeTime(at(5_000), now), "just now");
	assert.equal(formatRelativeTime(at(5 * 60_000), now), "5m ago");
	assert.equal(formatRelativeTime(at(3 * 3_600_000), now), "3h ago");
	assert.equal(formatRelativeTime(at(2 * 86_400_000), now), "2d ago");
	assert.equal(formatRelativeTime(at(3 * 7 * 86_400_000), now), "3w ago");
	assert.equal(formatRelativeTime(at(60 * 86_400_000), now), "2mo ago");
	assert.equal(formatRelativeTime(at(400 * 86_400_000), now), "1y ago");
});

test("formatRelativeTime handles future timestamps gracefully", () => {
	const now = new Date("2024-06-15T12:00:00Z");
	assert.equal(formatRelativeTime(new Date(now.getTime() + 10_000), now), "just now");
});

test("prettifyPath collapses home and extracts project", () => {
	const p = prettifyPath("/home/user/workspace/bent", "/home/user");
	assert.equal(p.project, "bent");
	assert.equal(p.dir, "~/workspace/bent");
});

test("prettifyPath tolerates empty and trailing slashes", () => {
	assert.deepEqual(prettifyPath(""), {
		project: "(unknown)",
		dir: "(unknown location)",
	});
	assert.equal(prettifyPath("/a/b/c/").project, "c");
});

test("buildPreview prefers name, then first prompt, then fallback", () => {
	assert.equal(buildPreview(makeRecord({ name: "Auth refactor" })), "Auth refactor");
	assert.equal(buildPreview(makeRecord({ name: "" })), "Fix the login bug");
	assert.equal(
		buildPreview(
			makeRecord({ name: "", firstMessage: "", allMessagesText: "" }),
		),
		"(empty session)",
	);
});

test("derivePromptLabel strips markdown markers and wrapping quotes", () => {
	assert.equal(derivePromptLabel("> quoted request"), "quoted request");
	assert.equal(derivePromptLabel("## Heading prompt"), "Heading prompt");
	assert.equal(derivePromptLabel("- do the thing"), "do the thing");
	assert.equal(derivePromptLabel("1. first step"), "first step");
	assert.equal(derivePromptLabel('"please refactor"'), "please refactor");
	assert.equal(derivePromptLabel("`run tests`"), "run tests");
	assert.equal(derivePromptLabel("   plain text  "), "plain text");
});

test("buildPreview cleans the derived first-prompt label", () => {
	assert.equal(
		buildPreview(makeRecord({ name: "", firstMessage: "> # weird prompt" })),
		"weird prompt",
	);
});

test("hasSessionName reflects a non-empty name", () => {
	assert.equal(hasSessionName(makeRecord({ name: "x" })), true);
	assert.equal(hasSessionName(makeRecord({ name: "   " })), false);
	assert.equal(hasSessionName(makeRecord({ name: undefined })), false);
});

test("fuzzyScore returns null for non-matches and ranks substrings higher", () => {
	assert.equal(fuzzyScore("xyz", "hello world"), null);
	const sub = fuzzyScore("log", "fix the login bug");
	const seq = fuzzyScore("flb", "fix the login bug");
	assert.notEqual(sub, null);
	assert.notEqual(seq, null);
	assert.ok((sub as number) > (seq as number));
});

test("fuzzyScore is case-insensitive and rewards word starts", () => {
	const atStart = fuzzyScore("log", "login flow");
	const midWord = fuzzyScore("low", "yellowish");
	assert.ok((atStart as number) > (midWord as number));
});

test("searchHaystack includes name, prompt, cwd, and transcript", () => {
	const hay = searchHaystack(
		makeRecord({ name: "Deploy", cwd: "/srv/app", allMessagesText: "kubernetes" }),
	);
	assert.match(hay, /Deploy/);
	assert.match(hay, /\/srv\/app/);
	assert.match(hay, /kubernetes/);
});

test("filterAndSortSessions keeps recency order for empty query", () => {
	const older = makeRecord({ path: "old", modified: new Date("2024-01-01") });
	const newer = makeRecord({ path: "new", modified: new Date("2024-02-01") });
	const result = filterAndSortSessions([newer, older], "");
	assert.deepEqual(
		result.map((r) => r.path),
		["new", "old"],
	);
});

test("filterAndSortSessions ranks matches by score then recency", () => {
	const strong = makeRecord({
		path: "strong",
		firstMessage: "database migration",
		modified: new Date("2024-01-01"),
	});
	const weak = makeRecord({
		path: "weak",
		firstMessage: "d... a... t... a... b... a... s... e",
		modified: new Date("2024-01-02"),
	});
	const none = makeRecord({ path: "none", firstMessage: "unrelated" });
	const result = filterAndSortSessions([weak, none, strong], "database");
	assert.deepEqual(
		result.map((r) => r.path),
		["strong", "weak"],
	);
});

test("extractModelFromSessionText prefers latest model_change", () => {
	const text = [
		JSON.stringify({
			type: "message",
			message: { role: "assistant", provider: "openai", model: "gpt-4o" },
		}),
		JSON.stringify({
			type: "model_change",
			provider: "anthropic",
			modelId: "claude-sonnet-4-5",
		}),
	].join("\n");
	assert.deepEqual(extractModelFromSessionText(text), {
		provider: "anthropic",
		modelId: "claude-sonnet-4-5",
	});
});

test("extractModelFromSessionText falls back to assistant message", () => {
	const text = [
		JSON.stringify({ type: "message", message: { role: "user", content: "hi" } }),
		JSON.stringify({
			type: "message",
			message: { role: "assistant", provider: "anthropic", model: "claude-opus" },
		}),
	].join("\n");
	assert.deepEqual(extractModelFromSessionText(text), {
		provider: "anthropic",
		modelId: "claude-opus",
	});
});

test("extractModelFromSessionText tolerates malformed lines and returns null", () => {
	assert.equal(extractModelFromSessionText("not json\n{model but broken"), null);
	assert.equal(extractModelFromSessionText(""), null);
});

test("formatModelRef renders provider/model, model-only, or empty", () => {
	assert.equal(
		formatModelRef({ provider: "anthropic", modelId: "claude-sonnet-4-5" }),
		"anthropic/claude-sonnet-4-5",
	);
	assert.equal(formatModelRef({ modelId: "gpt-4o" }), "gpt-4o");
	assert.equal(formatModelRef(null), "");
});
