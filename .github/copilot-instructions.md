<!-- odla-ai agent setup:start -->
## odla agent workflow

For work that creates an odla app or adds odla services, read and follow
`.agents/skills/odla/SKILL.md`. It dispatches an existing static site to
`.agents/skills/odla-migrate/SKILL.md`. For production telemetry triage, use
`.agents/skills/odla-o11y-debug/SKILL.md`.

The complete runbooks and their references are installed in this repository.
Do not fetch online odla documentation as setup context. Network access is only
needed when a runbook deliberately calls the odla service, npm, Cloudflare, or
another configured provider.
<!-- odla-ai agent setup:end -->
