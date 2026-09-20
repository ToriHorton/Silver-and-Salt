#!/bin/zsh
# Install the odla o11y ingest token on the PRODUCTION Silver & Salt Capital
# Worker. The token is minted by `provision` and cached in
# .odla/credentials.local.json (envs.prod.o11yToken); this streams it into the
# Worker secret ODLA_O11Y_TOKEN without printing it. Without the token the
# @odla-ai/o11y wrapper is a network no-op and Chapter alerts only reach
# Workers Logs.
set -euo pipefail
cd "$(dirname "$0")/.."
node -e '
  const c = require("./.odla/credentials.local.json");
  const t = c.envs?.prod?.o11yToken;
  if (!t) { console.error("no prod o11yToken cached; run the prod provision first"); process.exit(1); }
  process.stdout.write(t);
' | npx wrangler secret put ODLA_O11Y_TOKEN >/dev/null
echo "ODLA_O11Y_TOKEN installed on the production Worker"
