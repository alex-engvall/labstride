// Only used to reconstruct older layouts in owned temporary test databases.
export function removeGitHubMigration(db){
  db.exec(`DROP TABLE github_webhooks;DROP TABLE github_candidates;DROP TABLE github_history;DROP TABLE github_items;
    DROP TABLE github_projects;DROP TABLE github_generations;DROP TABLE projection_holds;
    ALTER TABLE projection_attempts DROP COLUMN observed_version;
    ALTER TABLE projection_attempts DROP COLUMN acknowledged;
    ALTER TABLE projection_attempts DROP COLUMN mode;
    DELETE FROM schema_migrations WHERE version=12;PRAGMA user_version=11;`);
}
