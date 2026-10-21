# Illustrative Laravel deployment recipe

This is a contract example, not a runnable workflow or a claim of compatibility with a specific Laravel release.

1. A trusted workflow claims the operation and obtains source SHA, artifact policy and target reference.
2. Build dependencies and frontend assets using the application's own pinned CI process.
3. Upload a content-verified artifact into an owned new release directory.
4. Attach declared shared storage/configuration without exposing secrets in artifacts.
5. Apply the application's migration policy; stop if backup/compatibility prerequisites are missing.
6. Activate the release atomically where supported.
7. Restart/reload only explicitly permitted application services.
8. Check the configured HTTP/worker health and deployed revision; return a receipt.

PHP version, Composer/npm commands, queue implementation, database engine, process manager and web-server behavior belong to this recipe. The core carries only action inputs, source/target identity and results.

On failure, the recipe may switch back only if its rollback conditions are satisfied. Database migration consequences must be handled separately. Workspace cleanup removes the development checkout, not the application's active production release.
