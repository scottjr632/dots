import { Theme } from "@earendil-works/pi-coding-agent";
import {
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import {
	buildPreview,
	filterAndSortSessions,
	type ModelRef,
	formatModelRef,
	formatRelativeTime,
	hasSessionName,
	prettifyPath,
	type SessionRecord,
} from "./format.ts";

export type SessionScope = "project" | "all";

export interface SelectorOptions {
	theme: Theme;
	scope: SessionScope;
	home?: string;
	now?: () => Date;
	/** Records already sorted by recency (most recent first). */
	records: readonly SessionRecord[];
	/** Session file path of the currently active session, if any. */
	currentSessionPath?: string;
	/** Shared cache of resolved models. undefined = not yet loaded, null = none. */
	modelCache: Map<string, ModelRef | null>;
	/** Request re-render after async state (e.g. model load) changes. */
	requestRender: () => void;
	/** Ask the host to resolve the model for a record (async, fills modelCache). */
	onNeedModel: (record: SessionRecord) => void;
	/** Max number of session rows to show at once (adapts to terminal height). */
	maxVisible?: number;
}

const DEFAULT_MAX_VISIBLE = 8;
/** Below this width we stack recency onto the meta line to protect the preview. */
const NARROW_WIDTH = 52;
/** Below this width we drop the meta (path/model) line entirely. */
const TINY_WIDTH = 30;

/** Accept typed text (including pastes), but never raw escape/control input. */
function isPrintableInput(data: string): boolean {
	if (data.length === 0) return false;
	for (const ch of data) {
		const code = ch.codePointAt(0)!;
		if (code < 0x20 || code === 0x7f) return false;
	}
	return true;
}

/** Pad a possibly-styled string to an exact visible width (truncating if needed). */
function padEndVisible(text: string, width: number): string {
	const vw = visibleWidth(text);
	if (vw > width) return truncateToWidth(text, width, "…");
	return text + " ".repeat(width - vw);
}

/** Truncate plain text to width, then re-highlight the query substring. */
function highlightMatch(
	plain: string,
	query: string,
	width: number,
	base: (t: string) => string,
	match: (t: string) => string,
): string {
	const truncated = truncateToWidth(plain, width, "…");
	const q = query.trim().toLowerCase();
	if (q === "") return base(truncated);
	const idx = truncated.toLowerCase().indexOf(q);
	if (idx === -1) return base(truncated);
	const before = truncated.slice(0, idx);
	const hit = truncated.slice(idx, idx + q.length);
	const after = truncated.slice(idx + q.length);
	return base(before) + match(hit) + base(after);
}

export class SessionSelector {
	private readonly theme: Theme;
	private readonly all: readonly SessionRecord[];
	private readonly modelCache: Map<string, ModelRef | null>;
	private readonly requestRender: () => void;
	private readonly onNeedModel: (record: SessionRecord) => void;
	private readonly home?: string;
	private readonly now: () => Date;
	private readonly currentSessionPath?: string;

	private query = "";
	private filtered: SessionRecord[];
	private selectedIndex = 0;
	private scrollOffset = 0;
	private scope: SessionScope;
	private readonly maxVisible: number;

	private cachedWidth?: number;
	private cachedLines?: string[];

	onSelect?: (record: SessionRecord) => void;
	onCancel?: () => void;
	onToggleScope?: () => void;
	onDelete?: (record: SessionRecord) => void;
	onRename?: (record: SessionRecord) => void;

	constructor(opts: SelectorOptions) {
		this.theme = opts.theme;
		this.all = opts.records;
		this.modelCache = opts.modelCache;
		this.requestRender = opts.requestRender;
		this.onNeedModel = opts.onNeedModel;
		this.home = opts.home;
		this.now = opts.now ?? (() => new Date());
		this.scope = opts.scope;
		this.currentSessionPath = opts.currentSessionPath;
		this.maxVisible = Math.max(3, opts.maxVisible ?? DEFAULT_MAX_VISIBLE);
		this.filtered = filterAndSortSessions(this.all, this.query);
		this.requestModelForSelection();
	}

	getSelected(): SessionRecord | undefined {
		return this.filtered[this.selectedIndex];
	}

	getScope(): SessionScope {
		return this.scope;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private refilter(): void {
		const previous = this.getSelected();
		this.filtered = filterAndSortSessions(this.all, this.query);
		// Keep the previously selected record highlighted when still present.
		const nextIndex = previous
			? this.filtered.findIndex((r) => r.path === previous.path)
			: -1;
		this.selectedIndex = nextIndex >= 0 ? nextIndex : 0;
		this.clampScroll();
		this.requestModelForSelection();
		this.invalidate();
	}

	private clampScroll(): void {
		if (this.selectedIndex < this.scrollOffset) {
			this.scrollOffset = this.selectedIndex;
		} else if (this.selectedIndex >= this.scrollOffset + this.maxVisible) {
			this.scrollOffset = this.selectedIndex - this.maxVisible + 1;
		}
		const maxOffset = Math.max(0, this.filtered.length - this.maxVisible);
		if (this.scrollOffset > maxOffset) this.scrollOffset = maxOffset;
		if (this.scrollOffset < 0) this.scrollOffset = 0;
	}

	private requestModelForSelection(): void {
		const record = this.getSelected();
		if (!record) return;
		if (!this.modelCache.has(record.path)) this.onNeedModel(record);
	}

	private move(delta: number): void {
		if (this.filtered.length === 0) return;
		const len = this.filtered.length;
		this.selectedIndex = (this.selectedIndex + delta + len) % len;
		this.clampScroll();
		this.requestModelForSelection();
		this.invalidate();
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.up) || matchesKey(data, Key.ctrl("p"))) {
			this.move(-1);
			return;
		}
		if (matchesKey(data, Key.down) || matchesKey(data, Key.ctrl("n"))) {
			this.move(1);
			return;
		}
		if (matchesKey(data, Key.enter)) {
			const record = this.getSelected();
			if (record) this.onSelect?.(record);
			return;
		}
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.onCancel?.();
			return;
		}
		if (matchesKey(data, Key.ctrl("a"))) {
			this.onToggleScope?.();
			return;
		}
		if (matchesKey(data, Key.ctrl("d"))) {
			const record = this.getSelected();
			if (record) this.onDelete?.(record);
			return;
		}
		if (matchesKey(data, Key.ctrl("r"))) {
			const record = this.getSelected();
			if (record) this.onRename?.(record);
			return;
		}
		if (matchesKey(data, Key.backspace)) {
			if (this.query.length > 0) {
				this.query = this.query.slice(0, -1);
				this.refilter();
			}
			return;
		}
		if (isPrintableInput(data)) {
			this.query += data;
			this.refilter();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		const theme = this.theme;
		const w = Math.max(8, width);
		const inner = Math.max(1, w - 4); // account for "│ " + " │" framing

		// --- Inner content (each line sized to <= inner) ---
		const content: string[] = [];

		// Search row with a faux cursor.
		const caret = theme.fg("accent", "▏");
		const searchLabel = theme.fg("dim", "Search: ");
		const avail = Math.max(1, inner - visibleWidth("Search: ") - 1);
		const queryText =
			this.query === ""
				? theme.fg("dim", truncateToWidth("type to filter…", avail))
				: theme.fg("text", truncateToWidth(this.query, avail));
		content.push(`${searchLabel}${queryText}${caret}`);
		content.push("");

		if (this.filtered.length === 0) {
			content.push(...this.renderEmpty(inner));
		} else {
			this.clampScroll();
			const end = Math.min(
				this.filtered.length,
				this.scrollOffset + this.maxVisible,
			);
			for (let i = this.scrollOffset; i < end; i++) {
				content.push(
					...this.renderRow(this.filtered[i]!, i === this.selectedIndex, inner),
				);
			}
		}

		content.push("");
		content.push(...this.renderFooter(inner));

		// --- Frame the modal box ---
		const scopeLabel = this.scope === "all" ? "all projects" : "this project";
		const title = theme.fg("accent", theme.bold("Resume session"));
		const scopeMeta = theme.fg(
			"muted",
			`${scopeLabel} · ${this.filtered.length}/${this.all.length}`,
		);

		const lines: string[] = [];
		lines.push(this.boxTop(w, title, scopeMeta));
		for (const line of content) lines.push(this.boxLine(line, w));
		lines.push(this.boxBottom(w));

		// Every emitted line must respect the width budget.
		this.cachedLines = lines.map((line) => truncateToWidth(line, w));
		this.cachedWidth = width;
		return this.cachedLines;
	}

	/** Top border with an embedded title (left) and scope/count meta (right). */
	private boxTop(w: number, title: string, right: string): string {
		const border = (s: string) => this.theme.fg("border", s);
		let tw = visibleWidth(title);
		const rw = visibleWidth(right);

		// Preferred layout: ╭─ <title> <fill> <right> ─╮
		const fillWithRight = w - tw - rw - 8;
		if (fillWithRight >= 1) {
			return (
				border("╭─ ") +
				title +
				border(` ${"─".repeat(fillWithRight)} `) +
				right +
				border(" ─╮")
			);
		}

		// Narrow layout: drop the right meta, keep the title.
		let fill = w - tw - 7;
		if (fill < 1) {
			title = truncateToWidth(title, Math.max(1, w - 8), "…");
			tw = visibleWidth(title);
			fill = Math.max(1, w - tw - 7);
		}
		return border("╭─ ") + title + border(` ${"─".repeat(fill)} ─╮`);
	}

	/** Bottom border. */
	private boxBottom(w: number): string {
		return this.theme.fg("border", `╰${"─".repeat(Math.max(0, w - 2))}╯`);
	}

	/** Wrap one content line in side borders with single-column padding. */
	private boxLine(content: string, w: number): string {
		const border = (s: string) => this.theme.fg("border", s);
		const inner = Math.max(1, w - 4);
		return border("│ ") + padEndVisible(content, inner) + border(" │");
	}

	private renderEmpty(w: number): string[] {
		const theme = this.theme;
		if (this.all.length === 0) {
			const primary =
				this.scope === "all"
					? "No sessions found on this machine yet."
					: "No sessions found for this project.";
			const hint =
				this.scope === "all"
					? "Start a conversation to create one."
					: "Press ^A to search sessions from all projects.";
			return [
				theme.fg("warning", truncateToWidth(primary, w, "…")),
				theme.fg("dim", truncateToWidth(hint, w, "…")),
			];
		}
		const q = truncateToWidth(this.query.trim(), Math.max(1, w - 20));
		return [theme.fg("warning", `No sessions match "${q}"`)];
	}

	private renderRow(
		record: SessionRecord,
		selected: boolean,
		w: number,
	): string[] {
		const theme = this.theme;
		const prefix = selected ? theme.fg("accent", "› ") : "  ";
		const marker = selected
			? theme.fg("accent", "● ")
			: theme.fg("dim", "○ ");
		const isCurrent =
			this.currentSessionPath !== undefined &&
			record.path === this.currentSessionPath;

		const recency = formatRelativeTime(record.modified, this.now());
		const previewRaw = buildPreview(record);
		const named = hasSessionName(record);

		const baseFg = selected
			? (t: string) => theme.fg("text", theme.bold(t))
			: named
				? (t: string) => theme.fg("text", t)
				: (t: string) => theme.fg("muted", t);
		const matchFg = (t: string) => theme.fg("searchMatchText", theme.bold(t));

		// Fixed structural width consumed before the preview text.
		const gutter = visibleWidth("  ") + visibleWidth("● ");
		const currentTag = isCurrent ? " (current)" : "";
		const currentTagW = visibleWidth(currentTag);

		const rows: string[] = [];
		const wide = w >= NARROW_WIDTH;

		if (wide) {
			const rightW = visibleWidth(recency) + 2;
			const previewW = Math.max(4, w - gutter - rightW - currentTagW);
			const preview = highlightMatch(previewRaw, this.query, previewW, baseFg, matchFg);
			const tag = isCurrent ? theme.fg("success", currentTag) : "";
			const left = `${prefix}${marker}${preview}${tag}`;
			const right = theme.fg("dim", recency);
			rows.push(this.spread(left, right, w));
		} else {
			const previewW = Math.max(4, w - gutter - currentTagW);
			const preview = highlightMatch(previewRaw, this.query, previewW, baseFg, matchFg);
			const tag = isCurrent ? theme.fg("success", currentTag) : "";
			rows.push(`${prefix}${marker}${preview}${tag}`);
		}

		// Meta line: location · message count · model · (recency when narrow).
		if (w >= TINY_WIDTH) {
			const { dir } = prettifyPath(record.cwd, this.home);
			const parts: string[] = [dir, `${record.messageCount} msg${record.messageCount === 1 ? "" : "s"}`];
			const model = this.modelCache.get(record.path);
			if (model) parts.push(formatModelRef(model));
			if (!wide) parts.push(recency);
			const metaText = parts.join(" · ");
			const metaW = Math.max(1, w - 4);
			rows.push(`    ${theme.fg("dim", truncateToWidth(metaText, metaW, "…"))}`);
		}

		return rows;
	}

	private renderFooter(w: number): string[] {
		const theme = this.theme;
		const scopeHint = this.scope === "all" ? "this project" : "all projects";
		const position =
			this.filtered.length > 0
				? `${this.selectedIndex + 1}/${this.filtered.length}  `
				: "";
		const hints = [
			["↑↓", "move"],
			["enter", "resume"],
			["^R", "rename"],
			["^A", scopeHint],
			["^D", "delete"],
			["esc", "cancel"],
		]
			.map(([k, d]) => `${theme.fg("accent", k!)} ${theme.fg("dim", d!)}`)
			.join(theme.fg("borderMuted", "  ·  "));
		const posText = position ? theme.fg("dim", position) : "";
		return [this.spread(hints, posText, w)];
	}

	/** Place `right` flush to the right edge, `left` at the start, on one line. */
	private spread(left: string, right: string, w: number): string {
		const lw = visibleWidth(left);
		const rw = visibleWidth(right);
		if (lw + rw + 1 > w) {
			// Not enough room: keep the left content, drop the right.
			return truncateToWidth(left, w);
		}
		return left + " ".repeat(w - lw - rw) + right;
	}
}
