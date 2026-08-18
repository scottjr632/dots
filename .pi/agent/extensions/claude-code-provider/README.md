# Claude Code provider for pi

Runs the installed Claude Code executable through Anthropic's Claude Agent SDK while using pi as the conversation UI.

## Billing and safety warning

This integration is not a billing guarantee.

- Claude Code owns the agent loop and executes its own tools. Pi's active-tool list and `tool_call` gates do not govern those tools; Claude Code's permission system does.
- The extension removes `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, and Claude cloud-provider overrides from the child environment so the process uses the installed CLI's Claude login.
- Anthropic still controls billing. Disable **Extra Usage** in Claude settings if you do not want overage charges.
- The extension aborts when the SDK reports active overage, but that signal may arrive after a request starts. It cannot promise that no request will ever be charged.

Pi shows this warning when the provider is selected and requires confirmation before its first interactive request in each session. Print/JSON mode writes the warning to stderr.

## Requirements

```bash
claude auth status
```

The status should report `"authMethod": "claude.ai"` and a subscription type. API-key and Bedrock/Vertex/Foundry authentication are intentionally stripped from the spawned process.

## Use

Select either model from `/model`:

- `claude-code/opus`
- `claude-code/sonnet`

Or start pi directly:

```bash
pi --provider claude-code --model opus
```

Commands:

- `/claude-code-status` — show the CLI authentication method and subscription type.
- `/claude-code-new` — stop resuming the current native Claude session on the next turn.

## Session behavior

Each successful pi turn persists the native Claude session ID in the pi session. Continued turns resume and fork that ID. Forking each native turn keeps pi tree navigation and `/fork` isolated: choosing an older pi branch continues from the Claude state that existed at that point instead of leaking later work into it.

Claude-owned tool calls and results appear as expandable, display-only entries in pi's transcript. They are intentionally not emitted as pi tool calls: Claude Code has already executed them, and replaying them through pi would execute each operation twice. Nested Claude subagent tools are marked `subagent`.

On the first Claude turn after switching from another provider, the extension sends the existing pi conversation as a handoff. Later turns send only the newest user message because Claude Code owns its native transcript.

Images are not currently exposed by these provider models. In non-interactive modes, Claude tool calls requiring approval are denied because no approval UI exists.
