/**
 * Pure, dependency-free helpers for the resume-session selector.
 *
 * These functions never import from pi packages so they can be unit tested
 * with `node --test --experimental-strip-types` without a runtime harness.
 */

/** Minimal shape of a session record we care about (subset of pi's SessionInfo). */
export interface SessionRecord {
	path: string;
	id: string;
	cwd: string;
	name?: string;
	parentSessionPath?: string;
	created: Date;
	modified: Date;
	messageCount: number;
	firstMessage: string;
	allMessagesText: string;
}

/** Provider / model pair extracted from a session file. */
export interface ModelRef {
	provider?: string;
	modelId?: string;
}

// --- Terminal safety -------------------------------------------------------
// Session content (prompts, names, paths) is untrusted text and must never be
// able to inject terminal control sequences when we render it with styling.
// eslint-disable-next-line no-control-regex
const OSC_PATTERN =
	/(?:\u001b\]|\u009d)(?:[^\u0007\u001b\u009c]|\u001b(?!\\))*(?:\u0007|\u001b\\|\u009c)/g;
// eslint-disable-next-line no-control-regex
const CSI_PATTERN = /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g;
// eslint-disable-next-line no-control-regex
const ESCAPE_PATTERN = /\u001b(?:[()][0-2A-Z]|[ -/]*[@-~])/g;

export function sanitizeTerminalText(text: string): string {
	return text
		.replace(OSC_PATTERN, "")
		.replace(CSI_PATTERN, "")
		.replace(ESCAPE_PATTERN, "")
		.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");
}

/** Collapse whitespace/newlines and strip control sequences for single-line display. */
export function cleanOneLine(text: string): string {
	return sanitizeTerminalText(text).replace(/\s+/g, " ").trim();
}

// --- Time ------------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Compact, human relative time such as "just now", "5m", "3h", "2d", "4mo", "1y". */
export function formatRelativeTime(from: Date, now: Date = new Date()): string {
	const diff = now.getTime() - from.getTime();
	if (!Number.isFinite(diff)) return "";
	if (diff < 0) return "just now";
	if (diff < MINUTE) return "just now";
	if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
	if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
	if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;
	if (diff < MONTH) return `${Math.floor(diff / WEEK)}w ago`;
	if (diff < YEAR) return `${Math.floor(diff / MONTH)}mo ago`;
	return `${Math.floor(diff / YEAR)}y ago`;
}

// --- Paths -----------------------------------------------------------------

export interface PrettyPath {
	/** Last path segment, e.g. "bent". */
	project: string;
	/** Full directory with the home dir collapsed to "~". */
	dir: string;
}

export function prettifyPath(cwd: string, home?: string): PrettyPath {
	const safe = sanitizeTerminalText(cwd || "");
	if (!safe) return { project: "(unknown)", dir: "(unknown location)" };

	let dir = safe;
	if (home && (safe === home || safe.startsWith(`${home}/`))) {
		dir = `~${safe.slice(home.length)}`;
	}

	const segments = safe.replace(/\/+$/, "").split("/").filter(Boolean);
	const project = segments.length > 0 ? segments[segments.length - 1]! : safe;
	return { project, dir };
}

// --- Preview ---------------------------------------------------------------

/**
 * Turn a raw prompt into a cleaner one-line label: drop leading markdown
 * markers (quotes, headings, list bullets, numbering) and surrounding
 * quotes/backticks so the fallback label reads like a title.
 */
export function derivePromptLabel(raw: string): string {
	let s = cleanOneLine(raw);
	if (s === "") return "";
	s = s.replace(/^(?:>\s*|#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)+/, "");
	s = s.replace(/^["'`]+/, "").replace(/["'`]+$/, "");
	return s.trim();
}

/**
 * Build a one-line preview for a session: the user-set name if present,
 * otherwise a cleaned-up first user prompt. Returns a fallback for empty
 * sessions.
 */
export function buildPreview(record: SessionRecord): string {
	const name = record.name ? cleanOneLine(record.name) : "";
	if (name) return name;

	const first = derivePromptLabel(record.firstMessage || "");
	if (first) return first;

	const any = derivePromptLabel(record.allMessagesText || "");
	if (any) return any;

	return "(empty session)";
}

/** Whether the preview comes from an explicit session name vs. a prompt. */
export function hasSessionName(record: SessionRecord): boolean {
	return Boolean(record.name && cleanOneLine(record.name));
}

// --- Fuzzy filtering -------------------------------------------------------

/**
 * Score a subsequence match of `query` against `haystack` (case-insensitive).
 * Returns null when the query is not a subsequence. Higher is better.
 *
 * Rewards contiguous runs, matches at word boundaries, and early matches.
 */
export function fuzzyScore(query: string, haystack: string): number | null {
	const q = query.toLowerCase();
	const h = haystack.toLowerCase();
	if (q.length === 0) return 0;
	if (q.length > h.length) return null;

	// Fast path: exact substring gets a strong, position-weighted score.
	const idx = h.indexOf(q);
	if (idx !== -1) {
		const boundaryBonus = idx === 0 || /\W|_/.test(h[idx - 1] ?? " ") ? 40 : 0;
		return 1000 + boundaryBonus - idx + q.length * 4;
	}

	let score = 0;
	let hi = 0;
	let prevMatch = -2;
	for (let qi = 0; qi < q.length; qi++) {
		const ch = q[qi]!;
		let found = -1;
		for (; hi < h.length; hi++) {
			if (h[hi] === ch) {
				found = hi;
				break;
			}
		}
		if (found === -1) return null;
		score += 1;
		if (found === prevMatch + 1) score += 5; // contiguous run
		if (found === 0 || /\W|_/.test(h[found - 1] ?? " ")) score += 3; // word start
		score -= Math.min(found - prevMatch - 1, 4) * 0.1; // gap penalty (bounded)
		prevMatch = found;
		hi = found + 1;
	}
	return score;
}

/** Text used to match a session record against the query. */
export function searchHaystack(record: SessionRecord): string {
	return [
		record.name ?? "",
		record.firstMessage ?? "",
		record.cwd ?? "",
		record.allMessagesText ?? "",
	].join(" \u0000 ");
}

export interface RankedSession {
	record: SessionRecord;
	score: number;
}

/**
 * Filter and sort sessions for the given query.
 * Empty query keeps input order (callers pass records pre-sorted by recency).
 * Non-empty query keeps only matches, ranked by score then recency.
 */
export function filterAndSortSessions(
	records: readonly SessionRecord[],
	query: string,
): SessionRecord[] {
	const trimmed = query.trim();
	if (trimmed === "") return [...records];

	const ranked: RankedSession[] = [];
	for (const record of records) {
		const score = fuzzyScore(trimmed, searchHaystack(record));
		if (score !== null) ranked.push({ record, score });
	}
	ranked.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return b.record.modified.getTime() - a.record.modified.getTime();
	});
	return ranked.map((r) => r.record);
}

// --- Model extraction ------------------------------------------------------

/**
 * Extract the most-recent model reference from raw session JSONL text.
 *
 * Prefers an explicit `model_change` entry, then the last assistant message.
 * Scans from the end so we return the model that would resume. Returns null
 * when nothing usable is found. Tolerant of malformed lines.
 */
export function extractModelFromSessionText(text: string): ModelRef | null {
	const lines = text.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i]!.trim();
		if (line === "") continue;
		// Cheap pre-filter before attempting a JSON parse.
		if (!line.includes("model")) continue;

		let entry: unknown;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}
		if (!entry || typeof entry !== "object") continue;
		const obj = entry as Record<string, unknown>;

		if (obj.type === "model_change") {
			const provider =
				typeof obj.provider === "string" ? obj.provider : undefined;
			const modelId = typeof obj.modelId === "string" ? obj.modelId : undefined;
			if (provider || modelId) return { provider, modelId };
		}

		if (obj.type === "message") {
			const message = obj.message as Record<string, unknown> | undefined;
			if (message && message.role === "assistant") {
				const provider =
					typeof message.provider === "string" ? message.provider : undefined;
				const modelId =
					typeof message.model === "string" ? message.model : undefined;
				if (provider || modelId) return { provider, modelId };
			}
		}
	}
	return null;
}

/** Format a model reference for display, e.g. "anthropic/claude-sonnet-4-5". */
export function formatModelRef(ref: ModelRef | null | undefined): string {
	if (!ref) return "";
	if (ref.provider && ref.modelId) return `${ref.provider}/${ref.modelId}`;
	return ref.modelId ?? ref.provider ?? "";
}
