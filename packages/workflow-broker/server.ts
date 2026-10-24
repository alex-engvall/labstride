import { createServer } from 'node:http';
import { BrokerError } from '../core/workflow-broker.ts';
import type { WorkflowProvider, WorkflowMessage, WorkflowReceipt } from '../core/workflow-broker.ts';
import type { WorkflowBrokerStore } from '../storage-sqlite/workflow-broker.ts';
import { LifecycleError } from '../core/lifecycle.ts';
import { validated } from '../storage-sqlite/validation.ts';
import { createWorkflowVerifier } from './identity.ts';
import type { RequestListener } from 'node:http';

export function createWorkflowBroker(store: WorkflowBrokerStore, provider: WorkflowProvider,
  verify = createWorkflowVerifier(provider), diagnostics?: { handler?: RequestListener; allowEffects?: () => boolean }) {
  const server = createServer({ maxHeaderSize: 24576 }, async (request, response) => {
    if (request.url === '/v1/diagnostics/status' || request.url === '/v1/discovery/oidc-probe') {
      if (diagnostics?.handler) { diagnostics.handler(request, response); return; }
    }
    let operationId = '';
    const reply = (status: number, body: object) => {
      const value = validated('workflow-broker-reply', { schemaVersion: '1.0', ...body });
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff', connection: 'close' });
      response.end(JSON.stringify(value));
    };
    try {
      const path = /^\/v1\/operations\/([A-Za-z0-9_.:-]{1,256})\/(claim|authorize-effect|receipt)$/.exec(request.url ?? '');
      if (request.method !== 'POST' || !path) throw new BrokerError('not_found', 404);
      operationId = path[1]; const phase = path[2] as 'claim' | 'authorize-effect' | 'receipt';
      if (phase !== 'receipt' && diagnostics?.allowEffects?.() === false) throw new BrokerError('effect_blocked', 403);
      if (request.headers['content-type'] !== 'application/json' || request.headers['content-encoding']) throw new BrokerError('invalid_payload', 400);
      const authorization = /^Bearer ([\w.-]{1,16384})$/.exec(request.headers.authorization ?? '');
      if (!authorization) throw new BrokerError('identity_rejected', 403);
      const length = request.headers['content-length'];
      if (length && (!/^\d+$/.test(length) || Number(length) > 262144)) throw new BrokerError('invalid_payload', 413);
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > 262144) throw new BrokerError('invalid_payload', 413);
        chunks.push(Buffer.from(chunk));
      }
      let body: WorkflowMessage | WorkflowReceipt;
      try { body = validated(phase === 'receipt' ? 'receipt' : 'workflow-message', JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { throw new BrokerError('invalid_payload', 400); }
      const dispatch = store.workflowDispatch(operationId);
      if (!dispatch) throw new BrokerError('not_found', 404);
      const op = store.get('operation', operationId).request, snapshot = store.runConfiguration(op.runId)!;
      if (snapshot.configuration.broker.enabled === false) throw new BrokerError('effect_blocked', 403);
      const executor = await verify(authorization[1], snapshot.configuration.broker.oidcAudience, dispatch, op, phase);
      if (phase === 'claim') {
        const claim = store.claimWorkflow(operationId, body as WorkflowMessage, executor);
        reply(200, { operation: op, enrollment: dispatch.enrollment, claim });
      } else if (phase === 'authorize-effect') {
        const claim = store.authorizeWorkflowEffect(operationId, body as WorkflowMessage, executor);
        reply(200, { authorized: true, claimId: claim.claimId });
      } else {
        store.acceptWorkflowReceipt(operationId, body as WorkflowReceipt, executor);
        reply(200, { received: true });
      }
    } catch (error) {
      const safe = error instanceof BrokerError ? error : error instanceof LifecycleError && error.code === 'invalid_payload' ? new BrokerError('invalid_payload', 400) :
        error instanceof LifecycleError && error.code === 'effect_blocked' ? new BrokerError('effect_blocked', 403) : new BrokerError('broker_unavailable', 503);
      try { store.brokerDenied(operationId, safe.code); } catch { /* unavailable audit never grants permission */ }
      reply(safe.status, { error: safe.code });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.timeout = 15000;
  return server;
}
