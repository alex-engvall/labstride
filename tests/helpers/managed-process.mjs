import { startCoordinator } from '../../apps/coordinator/main.ts';
import { acquireServiceLock } from '../../packages/operations/loop.ts';
const [root, operation] = process.argv.slice(2);
if (operation === 'lock') { await acquireServiceLock(root); process.send({ locked: true }); }
else { const runtime = startCoordinator(root); process.send(runtime.store.beginManagedEffect(operation, 'thread-start', { requestDigest: 'same' })); }
setInterval(() => {}, 10000);
