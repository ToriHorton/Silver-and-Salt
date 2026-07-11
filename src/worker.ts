// Phase 1 Worker for the Silver & Salt Capital site: a health endpoint
// plus pass-through to the static assets binding. No odla services yet.

interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "content-type": "application/json",
          "x-odla-worker": "silver-and-salt-capital",
        },
      });
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
