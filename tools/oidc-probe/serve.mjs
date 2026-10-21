import { readFileSync } from 'node:fs';
import { createProbeServer, createRunReader, createVerifier, validatePolicy } from './probe.mjs';

// No dotenv execution, credential file loading, shell or token output.
// The operator supplies a short-lived, Actions-read token from a separate process.
try {
  if (process.argv.length !== 3) throw new Error('expected_policy_path');
  const policy = validatePolicy(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  const readRun = createRunReader(process.env.LABSTRIDE_PROBE_GITHUB_TOKEN);
  const portText = process.env.LABSTRIDE_PROBE_PORT ?? '8789';
  if (!/^[1-9][0-9]{3,4}$/.test(portText) || Number(portText) > 65535) throw new Error('invalid_port');
  const server = createProbeServer(createVerifier(policy, { readRun }));
  server.on('request', (request, response) => {
    if (request.method === 'POST' && request.url === '/v1/discovery/oidc-probe') {
      response.once('finish', () => console.log(JSON.stringify({ schemaVersion: '1.0',
        event: 'discovery_http_result', status: response.statusCode, at: new Date().toISOString() })));
    }
  });
  server.on('error', () => { console.error('probe_listen_failed'); process.exitCode = 1; });
  server.listen(Number(portText), '127.0.0.1', () => console.log('oidc_discovery_probe_listening_on_loopback'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close(); server.closeAllConnections();
  });
} catch {
  console.error('probe_startup_failed_check_policy_and_read_token');
  process.exitCode = 1;
}
