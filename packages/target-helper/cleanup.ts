import { join } from 'node:path';
import { WorkspaceRegistry } from './workspaces.ts';
import type { WorkspaceDependencies } from './workspaces.ts';
import { sourceAccess } from './workspace-git.ts';
import type { WorkspacePolicy } from './workspace-contracts.ts';
import { inspectCleanupGit } from './cleanup-git.ts';
import type { CleanupGitOptions } from './cleanup-git.ts';
import { validated } from '../storage-sqlite/validation.ts';
import { digest } from '../configuration/json.ts';
import type { TrustedCleanupInspectionRequestV4 as Request } from '../../contracts/generated/ssh-cleanup-request.ts';
import type { TrustedCleanupInspectionResponseV4 as Response } from '../../contracts/generated/ssh-cleanup-response.ts';

export async function inspectCleanup(policy: WorkspacePolicy, input: unknown, dependencies: WorkspaceDependencies = {}, gitOptions: CleanupGitOptions = {}): Promise<Response> {
  const request = validated('ssh-cleanup-request', input as Request);
  const { workspaceId: _workspace, creationOperationId: _creation, receiptDigest: _receipt, policy: _policy, ...base } = request;
  const unknown = (): Response => ({ ...base, outcome: 'outcome_unknown', inspection: null });
  if (request.installationId !== policy.installationId || request.targetId !== policy.targetId || request.targetRevision !== policy.targetRevision ||
    request.policy.regenerableIgnoredPaths.some(path => path === '.git' || path.startsWith('.git/'))) return unknown();
  const registry = new WorkspaceRegistry(policy, dependencies);
  try {
    const observed = await registry.inspectOperation(request.creationOperationId), receipt = observed.workspace;
    if (observed.outcome !== 'ok' || !receipt || receipt.workspaceId !== request.workspaceId || digest(receipt) !== request.receiptDigest) return unknown();
    const root = policy.roots.find(root => root.id === receipt.rootId), source = policy.sources.find(source => source.repositoryId === receipt.source.repositoryId);
    if (!root || !source) return unknown();
    const inspected = inspectCleanupGit(join(root.path, receipt.locator, 'source'), sourceAccess(source), request.policy.regenerableIgnoredPaths, gitOptions);
    const after = await registry.inspectOperation(request.creationOperationId);
    if (after.outcome !== 'ok' || digest(after.workspace) !== request.receiptDigest) return unknown();
    return validated('ssh-cleanup-response', { ...base, outcome: 'ok', inspection: { schemaVersion: '1.0', requestId: request.requestId,
      installationId: request.installationId, targetId: request.targetId, workspaceId: request.workspaceId, creationOperationId: request.creationOperationId,
      receiptDigest: request.receiptDigest, policyDigest: digest(request.policy), observedAt: new Date().toISOString(), ...inspected } });
  } catch { return unknown(); }
  finally { registry.close(); }
}
