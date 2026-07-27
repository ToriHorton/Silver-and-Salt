---
name: odla-o11y-debug
description: >
  Triage a production issue in an app instrumented with @odla-ai/o11y — find why
  it's erroring, why latency or cost is spiking, and what's unusual about the bad
  requests — by reading the odla-o11y API. Use when a deployed odla app is
  misbehaving and you need to dig into its telemetry.
runbookOrder: []
---

# odla-o11y-debug

You are debugging a **live odla app** through its observability data. The app is
instrumented with `@odla-ai/o11y`; its traces, errors, metrics, and LLM cost land
in the `odla-o11y` collector. This skill is the read side: how to pull the data
and reason from a symptom to a cause.

The core move is **cutting high-dimensional data to isolate the bad slice** — not
"is p95 high" but "*which* route / status / model / user is dragging it, and what
do those requests share."

## Access

All reads go through the platform shell, operator-authed, so the collector's token
never leaves the server:

```
GET https://odla.ai/o11y/<appId>/<endpoint>?env=prod
Authorization: Bearer <developer-token>
```

Get `<developer-token>` from `@odla-ai/cli` or the device handshake: start with
`POST https://odla.ai/handshake` and
`{"email":"<existing-odla-account>","label":"o11y debugger"}`, show the returned
verification URL, then poll `POST /handshake/poll`. Email is a non-secret
identifier; never ask for a password or session token. The matching account
must sign in and explicitly review and approve the exact code. `env` is `prod`
(default) or `dev`. If a read returns `{"error":"ae_not_configured"}` (501), the app's metrics
reads aren't turned on yet — errors/traces still work; say so and fall back to them.

## Endpoints

| Endpoint | Answers |
| --- | --- |
| `GET /o11y/<app>/events` | recent activity feed (traces + errors), newest first |
| `GET /o11y/<app>/errors` | deduped error groups (type, code, route, count, last seen) |
| `GET /o11y/<app>/errors/<fingerprint>` | **one group + its message + STACK + span waterfall** |
| `GET /o11y/<app>/traces/<traceId>` | the merged span tree for a trace |
| `GET /o11y/<app>/metrics/red?minutes=60` | request/error/latency by route |
| `GET /o11y/<app>/metrics/timeseries?minutes=60` | RED over time (spot the spike) |
| `GET /o11y/<app>/explore?dimension=&metric=` | **RED grouped by ANY dimension** |
| `GET /o11y/<app>/llm/cost?minutes=1440` | spend by provider/model |
| `GET /o11y/<app>/llm/cost/timeseries` | spend over time |
| `GET /o11y/<app>/alerts` | configured triggers + firing history |

`explore` dimensions: `route`, `status`, `name`, `kind`, `http_status`,
`http_method`, `env`. `metric` (what to rank by): `p95_ms`, `avg_ms`, `requests`,
`errors`.

## Triage loops

**An error is reported.** `GET /errors` → find the group by type/route/count →
`GET /errors/<fingerprint>`. The response `bundle` carries the **message and full
stack** (recovered from the logs signal — this is the whole point; older builds
dropped it). Read the stack, then read the `spans` waterfall to see which
downstream call (db, LLM, fetch) failed or was slow. Name the failing line.

**Latency or error rate is spiking ("why is p95 up?").** This is the exploration
loop:
1. `GET /metrics/timeseries?minutes=<window>` — confirm the spike and its window.
2. `GET /explore?dimension=route&metric=p95_ms` — which route owns the p95? Then
   pivot the dimension: `status`, `http_status`, `http_method`, `env` — keep
   slicing until one value dominates the metric.
3. Pull a couple of the offending traces (`/events` filtered to that route, then
   `/traces/<id>`) and read their spans + attributes. State **what the bad
   requests share** (a route, a status code, a slow db/LLM span, a deploy env).

**Cost is climbing.** `GET /llm/cost/timeseries` (when) + `GET /llm/cost` (which
model). A single expensive model or a runaway call count is usually the story.

**"Is anything already watching this?"** `GET /alerts` — configured triggers and
their firing history (with per-channel delivery). If a spike had no trigger,
suggest one (metric + threshold + window).

## Reasoning discipline

- **Lead with the stack.** For any error, quote `bundle.message` and the top of
  `bundle.stack` before theorizing — it usually names the cause outright.
- **Isolate before explaining.** Don't explain an aggregate ("p95 is 800ms");
  slice with `explore` until you have the specific cohort, then explain that.
- **Attribute, don't guess.** "These slow requests are all `http_status=503` on
  `POST /pay`" beats "the payment service might be slow."
- **Weighted counts.** Metric aggregates are sampling-weighted (Analytics Engine
  adaptively samples under load) — treat counts as estimates, ratios as sound.
- **Say what you couldn't see.** Arbitrary custom attributes live in the trace
  payload, not the group-by dimensions; if the cohort is defined by a custom
  field, note that you inferred it from individual traces, not an aggregate.

## Land the finding

A triage that ends in chat is lost by the next session. File what you found as a
bug against the app, with the cohort in the description and the trace id in a
comment:

```cmd
npx @odla-ai/cli pm bug add --app <appId> --title "POST /pay 503s under retry" --severity high --desc "…"
```

Severity follows the blast radius, not your confidence. The conventions and the
rest of the `pm` command set are in `.agents/skills/odla/references/pm.md`
(installed alongside this skill).
