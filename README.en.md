# dsh-schedule

[![CI](https://github.com/csiroqa/dsh-schedule/actions/workflows/ci.yml/badge.svg)](https://github.com/csiroqa/dsh-schedule/actions/workflows/ci.yml)

> This repository is forked from [csiroqa/dsh-schedule](https://github.com/csiroqa/dsh-schedule). All original functionality, design, and implementation are credited to the original author, **csiroqa**; this fork only fixes the security issue documented below. See the upstream repository for the original project and license.

A **scheduled tasks + status monitoring** plugin for DeepSeek Harness (DSH): run agents automatically on a cron schedule (daily digests, periodic checks, automated reports), and inspect combined system/harness status via the `/status` command and a settings dashboard.

中文: [README.md](README.md)

## Features

### Scheduled tasks

- **Cron schedule** (5 fields: minute hour day month weekday; `0 9 * * *` = daily at 09:00): a ticker checks every `tickSeconds`, minute precision, no concurrent runs per task
- **Automatic execution**: spawns a one-shot agent (working directory attached to its workspace, model follows the settings selection or config), runs the prompt, persists the session log (visible in the sidebar), and records the outcome back to the task
- **Task management**: `/schedule list / add / remove / pause / resume / run`, plus the "Schedule" tab under Settings > Plugins
- **Timeout guard**: a run is force-stopped after `maxRunMs` (default 30 min)
- **Persistence**: tasks live in `$DSH_HOME/schedule.json` (atomic writes, startup-safe)

### Status monitoring

- `/status`: uptime / CPU / memory / disk / active sessions / agents / plugins / model
- "Status" tab under Settings > Plugins: live dashboard (auto-refresh every 5 s, pausable)

## Configuration

Optional config on the plugin row (`cordis.patch.yml`):

| Key | Default | Description |
| --- | --- | --- |
| `defaultCwd` | DSH process startup dir | Default working directory for tasks |
| `defaultProvider` / `defaultModel` | model selection in settings | Default provider/model for tasks |
| `tickSeconds` | `30` | Ticker interval in seconds |
| `maxRunMs` | `1800000` (30 min) | Per-run timeout in ms; `0` = no limit |

## Install

Requirements: Node.js >= 22, pnpm, a local checkout of `deepseek-harness` (dependencies use `link:` to `../deepseek-harness`).

```sh
git clone https://github.com/csiroqa/dsh-schedule.git
cd dsh-schedule
pnpm install
pnpm build

# install into web profile (link: this directory)
dsh plugin --profile web add link:$(pwd)   # POSIX
# Windows: dsh plugin --profile web add link:E:\path\to\dsh-schedule
```

Restart `dsh web` and hard-refresh the browser (**Ctrl+F5**).

## Usage

1. Run `/schedule list`; add a task with `/schedule add 0 9 * * * summarize yesterday's progress every day at 9:00`
2. Settings > Plugins > **Schedule**: add / run now / pause / resume / remove
3. Settings > Plugins > **Status**: live dashboard
4. `/status`: combined report in the chat

## Compatibility

- **Platforms**: Windows / macOS / Linux (Node >= 22) — builds and smoke tests are verified on all three platforms via [GitHub Actions CI](https://github.com/csiroqa/dsh-schedule/actions)
- **Disk stats**: uses `node:fs` `statfs` on all platforms (Windows maps to the system disk-space API); degrades gracefully when unsupported
- Developed against a DSH `0.1.1-rc.2` source checkout and verified with `@deepseek-ai/dsh@0.1.1-rc.2` (npm global/npx install)
- The client half depends only on platform modules (react, etc.)
- Build: `tsdown` (host `lib/index.js` + browser `lib/client.js`, standard `window.__ModuleLoader__.load` closure-factory format)

## Changes in this fork (relative to upstream csiroqa/dsh-schedule)

A security scan found that `POST /dsh-schedule/tasks` (the settings-page endpoint for adding/removing/pausing/resuming/running tasks) relied only on loopback binding for protection and never validated the request's origin. Because that endpoint triggers an agent run with the **full permissions of the current DSH account**, unattended, any webpage open in the same browser could forge a cross-site request — including the classic `Content-Type: text/plain` form trick that bypasses the browser's CORS preflight — to silently add or immediately run a task, effectively achieving local code execution.

Fix (`src/http.ts`), three layers of defense:
- **Host allowlist** (active while bound to loopback): the `Host` header must exactly match `127.0.0.1`, `localhost`, or `[::1]` plus the actual listening port. This layer specifically defends against **DNS rebinding** — an attacker's domain can have its DNS record re-resolve to `127.0.0.1`, but the browser still sends the original hostname (taken from the URL) as the `Host` header, unaffected by what it resolved to — so this rule catches it even though `Origin` and `Host` would otherwise agree with each other (which is exactly why rebinding can slip past an Origin==Host check alone). When bound to `0.0.0.0` (an admin has deliberately widened it beyond loopback), valid hosts can't be enumerated in advance, so this layer is skipped and the Origin check below is the remaining defense.
- **Validate that `Origin` matches `Host`**: reject (403) any request that carries an `Origin` header not matching `Host` (which a genuine cross-site request always will); requests without an `Origin` header (e.g. local scripts/CLI tools) are still treated as trusted, so local automation keeps working; an `Origin` header that's present but empty or malformed is treated as untrusted (a security check should fail closed on anomalous input, not default to trusting it).
- **Strictly require `Content-Type: application/json`** (case-insensitive, ignoring parameters like `charset`), rejecting `text/plain` / `application/x-www-form-urlencoded` / `multipart/form-data` — the three encodings an HTML form can produce, all of which skip the browser's preflight check.
- Confirmed DSH's `host/webserver` framework itself performs no Origin/CORS/Host validation, so this defense had to live in the plugin's own route handler.
- Added `src/http.spec.ts` covering the edge cases of all three checks (including DNS rebinding, IPv6 loopback addresses, and opaque `Origin` values).

No other functionality or implementation was changed — all credit for those goes to the original author.

## Security notes

- **Scheduled tasks run unattended with the current DSH account's permissions** (file read/write, command execution) — only add content you trust
- `/dsh-schedule/*` endpoints are loopback-only (DSH binds to 127.0.0.1 by default); do not expose the DSH port to the public internet
- `POST /dsh-schedule/tasks` additionally validates a Host allowlist, that `Origin` matches `Host`, and `Content-Type`, to prevent browser-based cross-site request forgery and DNS rebinding (see "Changes in this fork" above)

## License

**MIT License** (see [LICENSE](LICENSE)). Use, modify, reference, or include it in your own plugin collections — just keep the license notice and credit this repository.

## Related

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- Companion plugin: [dsh-archive-viewer](https://github.com/csiroqa/dsh-archive-viewer) (archive enhancements: auto-archive / folders / knowledge library / bookmarks & notes)
- Plugin form reference: [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) (`dsh.bundle.patch` + `dsh.client` declaration + slot registration + tsdown dual-half build)
