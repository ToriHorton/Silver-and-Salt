import { createClerkClient } from "@odla-ai/auth-clerk";

let clientPromise;
/** Only invitation acceptance loads sign-in; ordinary signup stays public. */
export async function namedSeatClaimApi(path, options = {}) {
  if (path !== "/api/named-seat/accept" || options.method !== "POST") throw Error("unsupported invitation request");
  clientPromise ??= (async () => {
    const response = await fetch("/api/config");
    if (!response.ok) throw Error("sign-in unavailable");
    const config = await response.json();
    if (!config.clerkPublishableKey) throw Error("sign-in unavailable");
    const client = createClerkClient({ publishableKey: config.clerkPublishableKey });
    await client.load();
    return client;
  })().catch(error => { clientPromise = undefined; throw error; });
  const client = await clientPromise;
  const token = await client.getToken();
  if (!token) {
    const returnUrl = `${window.location.pathname}${window.location.search}`;
    await client.instance.openSignIn({ forceRedirectUrl: returnUrl });
    throw Error("sign in with the invited email, then accept again");
  }
  const response = await fetch(path, { ...options, headers: { "content-type": "application/json", authorization: `Bearer ${token}` } });
  if (!response.ok) throw Error("invitation acceptance unconfirmed");
  return response.json();
}
