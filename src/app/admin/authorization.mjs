// The server resolves private Clerk roles and protected odla grants. Never
// infer administrative access from membership, a role label, or public metadata.
export function isAdminAuthorized(user) {
  return user?.authorized === true;
}
