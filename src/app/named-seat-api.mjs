import { createClerkClient } from "@odla-ai/auth-clerk";

let clientPromise;
/** A verified recipient session follows the invitation through details and acceptance. */
export async function namedSeatClaimApi(path, options = {}) {
  const method = options.method ?? "GET";
  const url = new URL(path, window.location.origin ?? "https://chapter.invalid");
  const invitationRead = method === "GET" && path.startsWith("/api/named-seat/invitation?") && url.pathname === "/api/named-seat/invitation" &&
    [...url.searchParams.keys()].every(key => key === "seat");
  if (!invitationRead && !(method === "POST" && ["/api/named-seat/accept", "/api/applications"].includes(path))) throw Error("unsupported invitation request");
  return signedInFetch(path, options, "Please sign in or create an account with the invited email, then retry your invitation.");
}

async function signedInFetch(path, options, signInMessage) {
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
    await client.instance.openSignIn({ withSignUp: true, forceRedirectUrl: returnUrl, signUpForceRedirectUrl: returnUrl });
    throw Error(signInMessage);
  }
  const response = await fetch(path, { ...options, headers: { "content-type": "application/json", authorization: `Bearer ${token}` } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(typeof result.error === "string" ? result.error.slice(0, 400) : "Your invitation could not be confirmed. Please retry.");
  return result;
}
