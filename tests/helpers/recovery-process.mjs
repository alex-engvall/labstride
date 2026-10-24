import { cli } from '../../apps/cli/main.ts';
process.umask(0o077);
await cli(['recovery','begin','--config',process.argv[2]], value => process.send(value));
process.on('message', () => {});
