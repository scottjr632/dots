import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";

const ARROW_UP = "\x1b[A";
const ARROW_DOWN = "\x1b[B";

/** Adds a prompt glyph to the first line of Pi's input editor. */
class PromptGlyphEditor extends CustomEditor {
	// Ctrl+P/Ctrl+N move through the autocomplete list while it is open. Handled
	// before super so the app bindings (model cycling) still win when it is closed.
	handleInput(data: string): void {
		if (this.isShowingAutocomplete()) {
			if (matchesKey(data, "ctrl+p")) return super.handleInput(ARROW_UP);
			if (matchesKey(data, "ctrl+n")) return super.handleInput(ARROW_DOWN);
		}

		super.handleInput(data);
	}

	render(width: number): string[] {
		// Pi copies its default one-column padding onto custom editors after the
		// factory returns, so reserve the glyph columns at render time instead.
		this.setPaddingX(2);
		const lines = super.render(width);

		// The first content row follows the editor's top border. Replacing the two
		// reserved columns preserves the exact rendered line width.
		if (lines.length > 1) {
			lines[1] = lines[1]!.replace(/^  /, `${this.borderColor("❯")} `);
		}

		return lines;
	}
}

export default function promptGlyphExtension(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		ctx.ui.setEditorComponent((tui, theme, keybindings) =>
			new PromptGlyphEditor(tui, theme, keybindings),
		);
	});
}
