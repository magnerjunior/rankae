/** Business conflicts must not use Postgres serialization_failure: PostgREST retries it. */
export function isRevisionConflict(code?: string): boolean {
  // Keep old deployments compatible during the database/application rollout.
  return code === "PT409" || code === "40001";
}
