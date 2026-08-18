# resume-selector

A polished, searchable **modal** session picker for resuming past Pi
conversations. It opens as a centered, bordered dialog floating over the chat
(via an overlay), sized to the terminal and clamped to ~85% height.

## Invoke

- `/sessions` — open the selector (primary command)
- `/resume-plus` — the same selector, named for discoverability next to `/resume`

Both are global (user-scoped) and available in every project. Interactive
(TUI) mode only; in non-interactive modes it points you back to `/resume`.

## Why not replace `/resume`?

`/resume` is a **built-in interactive command** handled by the app itself.
Extensions register commands in a separate dispatch path and cannot reliably or
safely shadow core navigation UI, so this extension adds a clearly named command
that lives alongside the built-in flow instead of overriding it. The stock
`/resume` keeps working unchanged.

## Features

- **Fuzzy search** across session name, first prompt, working directory, and
  transcript text. Type to filter; matches are highlighted.
- **Rich rows**: name / prompt preview, project path (with `~` collapsing),
  recency (`3h ago`), message count, and the resolved **model**
  (`provider/model`, loaded lazily for the highlighted session).
- **Scope toggle** (`Ctrl+A`) between *this project* and *all projects*.
- **Delete to trash** (`Ctrl+D`) with confirmation; uses the `trash` CLI when
  available and only falls back to a permanent delete otherwise.
- Presented as a **floating modal overlay** (centered, bordered box) that
  tracks terminal resizes and keeps keyboard focus while open.
- Handles **narrow terminals** (recency reflows onto the meta line, then the
  meta line drops on very small widths), and clear **empty / error states**.
- Visible row count **adapts to terminal height** so the box stays on screen.

## Keys

| Key | Action |
| --- | --- |
| `↑` / `↓` | Move selection |
| type / `Backspace` | Filter |
| `Enter` | Resume selected session |
| `Ctrl+A` | Toggle project / all-projects scope |
| `Ctrl+D` | Delete selected session (with confirm) |
| `Esc` / `Ctrl+C` | Cancel |

## Development

- `npm run check` — type-check with the shared toolchain.
- `npm test` — run unit tests for the pure formatting/search helpers.

Only public, supported APIs are used: `SessionManager.list` / `listAll`,
`ctx.switchSession`, `ctx.ui.custom`, and `@earendil-works/pi-tui` components.
