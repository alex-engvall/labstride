// Only used to reconstruct older layouts in owned temporary test databases.
export function removeGitHubMigration(db){
  db.exec('DROP TABLE IF EXISTS workflow_receipts; DROP TABLE IF EXISTS workflow_claims; DROP TABLE IF EXISTS workflow_dispatches; DELETE FROM schema_migrations WHERE version=14;');
  db.exec('DROP TABLE IF EXISTS managed_phases; DROP TABLE IF EXISTS managed_summary_errors;');
  db.exec(`DROP TABLE IF EXISTS managed_summaries; DROP TABLE IF EXISTS managed_reports; DROP TABLE IF EXISTS managed_sessions;
    DROP TABLE IF EXISTS managed_effects; DROP TABLE IF EXISTS managed_pull_requests;
    DROP TABLE IF EXISTS workflow_diagnostics; DROP TABLE IF EXISTS workflow_steps;
    DELETE FROM schema_migrations WHERE version=13;`);
  db.exec(`DROP TABLE github_webhooks;DROP TABLE github_candidates;DROP TABLE github_history;DROP TABLE github_items;
    DROP TABLE github_projects;DROP TABLE github_generations;DROP TABLE projection_holds;
    ALTER TABLE projection_attempts DROP COLUMN observed_version;
    ALTER TABLE projection_attempts DROP COLUMN acknowledged;
    ALTER TABLE projection_attempts DROP COLUMN mode;
    DELETE FROM schema_migrations WHERE version=12;PRAGMA user_version=11;`);
}
