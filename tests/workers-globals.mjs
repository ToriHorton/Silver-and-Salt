// The Workers runtime globals a test needs when it drives the exported Worker
// under Node. withObservability (@odla-ai/o11y, via @pydantic/otel-cf-workers)
// instruments the Cache API on its first invocation and paces its signal
// export with scheduler.wait(); Node has neither. This installs an empty,
// stateless Cache (nothing matches, puts are dropped) and a scheduler whose
// wait is a plain timer. Everything else the Worker touches (Request,
// Response, fetch, crypto) Node already has. Import it before the module
// under test.
const emptyCache = {
  async match() { return undefined; },
  async put() {},
  async delete() { return false; },
};

export function installWorkersGlobals() {
  if (!("caches" in globalThis)) {
    globalThis.caches = { default: emptyCache, async open() { return emptyCache; } };
  }
  if (!("scheduler" in globalThis)) {
    globalThis.scheduler = { wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };
  }
}

installWorkersGlobals();
