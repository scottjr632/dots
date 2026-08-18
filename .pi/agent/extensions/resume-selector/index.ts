/**
 * Resume Session Selector
 * =======================
 *
 * A polished, searchable picker for finding and resuming Pi sessions.
 *
 * Why a new command instead of replacing `/resume`?
 * -------------------------------------------------
 * `/resume` is a built-in *interactive* command handled by the app itself, not
 * something an extension can override safely through `registerCommand` (extension
 * commands live in their own dispatch path and cannot reliably shadow core
 * navigation UI). Rather than fight that, this extension adds a clearly named
 * command that lives alongside the built-in flow:
 *
 *   /sessions       – open the enhanced selector (primary name)
 *   /resume-plus    – the same selector, discoverable next to /resume
 *
 * The built-in `/resume` keeps working exactly as before.
 *
 * Features
 * --------
 * - Fuzzy search across session name, first prompt, path, and transcript text.
 * - Rich rows: name / prompt preview, project path, recency, message count, and
 *   the resolved model (loaded lazily for the highlighted session).
 * - Scope toggle (Ctrl+A) between the current project and all projects.
 * - Delete a session to trash (Ctrl+D) with confirmation.
 * - Graceful handling of narrow terminals, empty lists, and load errors.
 *
 * Only public, supported APIs are used: SessionManager.list/listAll,
 * ctx.switchSession, ctx.ui.custom, and pi-tui components.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
	extractModelFromSessionText,
	type ModelRef,
	type SessionRecord,
} from "./src/format.ts";
import {
	SessionSelector,
	type SessionScope,
} from "./src/selector.ts";

type SelectorResult =
	| { type: "select"; record: SessionRecord }
	| { type: "toggle" }
	| { type: "delete"; record: SessionRecord }
	| { type: "rename"; record: SessionRecord }
	| { type: "cancel" };

/** Sort newest-first by modified time. */
function byRecency(records: SessionRecord[]): SessionRecord[] {
	return [...records].sort(
		(a, b) => b.modified.getTime() - a.modified.getTime(),
	);
}

export default function resumeSelectorExtension(pi: ExtensionAPI) {
	const handler = async (_args: string, ctx: ExtensionCommandContext) => {
		if (ctx.mode !== "tui") {
			ctx.ui.notify(
				"The session selector needs interactive mode. Use /resume instead.",
				"warning",
			);
			return;
		}

		const home = homedir();
		const currentSessionPath = ctx.sessionManager.getSessionFile();
		const modelCache = new Map<string, ModelRef | null>();
		const modelInFlight = new Set<string>();
		// Cache loaded lists per scope so scope toggles feel instant.
		const listCache = new Map<SessionScope, SessionRecord[]>();

		let scope: SessionScope = "project";

		const loadScope = async (target: SessionScope): Promise<SessionRecord[]> => {
			const cached = listCache.get(target);
			if (cached) return cached;
			const records =
				target === "all"
					? ((await SessionManager.listAll()) as SessionRecord[])
					: ((await SessionManager.list(ctx.cwd)) as SessionRecord[]);
			const sorted = byRecency(records);
			listCache.set(target, sorted);
			return sorted;
		};

		const resolveModel = (record: SessionRecord, onDone: () => void) => {
			if (modelCache.has(record.path) || modelInFlight.has(record.path)) return;
			modelInFlight.add(record.path);
			readFile(record.path, "utf8")
				.then((text) => {
					modelCache.set(record.path, extractModelFromSessionText(text));
				})
				.catch(() => {
					modelCache.set(record.path, null);
				})
				.finally(() => {
					modelInFlight.delete(record.path);
					onDone();
				});
		};

		const openSelector = (
			records: SessionRecord[],
		): Promise<SelectorResult> =>
			ctx.ui.custom<SelectorResult>(
				(tui, theme, _kb, done) => {
					// Fit the visible row count to the terminal height so the modal
					// stays within its overlay bounds on short terminals.
					const rows = process.stdout.rows ?? 24;
					const maxVisible = Math.max(
						3,
						Math.min(10, Math.floor((rows * 0.8 - 6) / 2)),
					);
					const selector = new SessionSelector({
						theme,
						scope,
						home,
						records,
						currentSessionPath,
						modelCache,
						maxVisible,
						requestRender: () => tui.requestRender(),
						onNeedModel: (record) => {
							// Re-render once the async transcript read settles so the
							// resolved model appears on the highlighted row.
							resolveModel(record, () => {
								selector.invalidate();
								tui.requestRender();
							});
						},
					});
					selector.onSelect = (record) => done({ type: "select", record });
					selector.onCancel = () => done({ type: "cancel" });
					selector.onToggleScope = () => done({ type: "toggle" });
					selector.onDelete = (record) => done({ type: "delete", record });
					selector.onRename = (record) => done({ type: "rename", record });

					return {
						render: (w) => selector.render(w),
						invalidate: () => selector.invalidate(),
						handleInput: (data) => {
							selector.handleInput(data);
							tui.requestRender();
						},
					};
				},
				{
					overlay: true,
					// Recomputed each render so the modal tracks terminal resizes.
					// Width is capped in columns since overlays have no maxWidth.
					overlayOptions: () => {
						const cols = process.stdout.columns ?? 80;
						return {
							anchor: "center",
							width: Math.max(40, Math.min(100, Math.floor(cols * 0.85))),
							minWidth: 40,
							maxHeight: "85%",
						};
					},
				},
			);

		// Main loop: reopen the selector after scope toggles and deletions.
		while (true) {
			let records: SessionRecord[];
			try {
				records = await loadScope(scope);
			} catch (err) {
				ctx.ui.notify(
					`Failed to load sessions: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
				return;
			}

			const result = await openSelector(records);

			if (result.type === "cancel") return;

			if (result.type === "toggle") {
				scope = scope === "all" ? "project" : "all";
				continue;
			}

			if (result.type === "delete") {
				await deleteSession(pi, ctx, result.record);
				// The record may exist in both scopes; refresh everything.
				listCache.clear();
				modelCache.delete(result.record.path);
				continue;
			}

			if (result.type === "rename") {
				await renameSession(pi, ctx, result.record, currentSessionPath);
				listCache.clear();
				continue;
			}

			// result.type === "select"
			const target = result.record;
			if (currentSessionPath && target.path === currentSessionPath) {
				ctx.ui.notify("Already in this session.", "info");
				return;
			}
			try {
				const outcome = await ctx.switchSession(target.path, {
					withSession: async (replaced) => {
						replaced.ui.notify("Resumed session.", "info");
					},
				});
				if (outcome.cancelled) {
					ctx.ui.notify("Resume cancelled.", "info");
				}
			} catch (err) {
				ctx.ui.notify(
					`Failed to resume: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
			}
			return;
		}
	};

	pi.registerCommand("sessions", {
		description: "Search and resume a past session (enhanced /resume)",
		handler,
	});
	pi.registerCommand("resume-plus", {
		description: "Search and resume a past session (enhanced /resume)",
		handler,
	});
}

/** Delete a session file to trash (falls back to permanent removal). */
async function deleteSession(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	record: SessionRecord,
): Promise<void> {
	const label = record.name || record.firstMessage || record.path;
	const confirmed = await ctx.ui.confirm(
		"Delete session?",
		`This removes:\n${label}\n\nThe file is moved to trash when possible.`,
	);
	if (!confirmed) return;

	// Prefer the `trash` CLI (recoverable) before an irreversible delete.
	try {
		const result = await pi.exec("trash", [record.path]);
		if (result.code === 0) {
			ctx.ui.notify("Session moved to trash.", "info");
			return;
		}
	} catch {
		// trash not installed; fall through to permanent delete.
	}

	try {
		const { rm } = await import("node:fs/promises");
		await rm(record.path, { force: true });
		ctx.ui.notify("Session deleted.", "info");
	} catch (err) {
		ctx.ui.notify(
			`Failed to delete session: ${err instanceof Error ? err.message : String(err)}`,
			"error",
		);
	}
}

/** Give a session a real display name (shown instead of the first prompt). */
async function renameSession(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	record: SessionRecord,
	currentSessionPath: string | undefined,
): Promise<void> {
	const existing = record.name?.trim() ?? "";
	const placeholder = existing || "e.g. Fix auth redirect loop";
	const input = await ctx.ui.input("Name this session", placeholder);
	if (input === undefined) return; // cancelled
	const name = input.trim();

	try {
		if (currentSessionPath && record.path === currentSessionPath) {
			// Keep the live session's in-memory state authoritative.
			pi.setSessionName(name);
		} else {
			// Persist directly to the target session file without switching to it.
			const sm = SessionManager.open(record.path);
			sm.appendSessionInfo(name);
		}
		ctx.ui.notify(
			name ? `Renamed session to "${name}".` : "Cleared session name.",
			"info",
		);
	} catch (err) {
		ctx.ui.notify(
			`Failed to rename session: ${err instanceof Error ? err.message : String(err)}`,
			"error",
		);
	}
}
