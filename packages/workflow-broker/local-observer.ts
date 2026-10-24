import type { DeploymentObserver } from '../core/deployments.ts';
import { LifecycleError } from '../core/lifecycle.ts';

// Reference profile for a separate local target service. It is not a qualified
// production transport and has no deployment, rollback or credential capability.
export function localJsonObserver(transport: typeof fetch = fetch): DeploymentObserver {
  function endpoint(configuration: Record<string, unknown>): URL {
    if (Object.keys(configuration).length !== 1 || typeof configuration.endpoint !== 'string') throw new LifecycleError('invalid_payload');
    const url = new URL(configuration.endpoint);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.hash || url.search)
      throw new LifecycleError('invalid_payload');
    return url;
  }
  return { id: 'labstride.observer.local-json', version: '1.0.0',
    validate(configuration) { endpoint(configuration); },
    async observe(request, signal) {
      const url = endpoint(request.configuration);
      // Correlation is separate from state: the service must read its actual
      // revision and health, rather than echoing an expected SHA from the caller.
      url.searchParams.set('observationId', request.observationId);
      const response = await transport(url, { method: 'GET', redirect: 'error', signal });
      if (response.status !== 200 || !response.body) throw new LifecycleError('provider_unavailable');
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 262144) throw new LifecycleError('invalid_payload');
        chunks.push(Buffer.from(chunk));
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    },
  };
}
