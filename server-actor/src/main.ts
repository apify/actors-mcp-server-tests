import { setTimeout } from 'node:timers/promises';

import { Actor, log } from 'apify';

import { add } from './add.js';
import { inputSchema } from './input-schema.js';
import { createApiServer } from './server.js';

await Actor.init();

Actor.on('aborting', async () => {
    await setTimeout(1000);
    await Actor.exit();
});

if (Actor.config.get('metaOrigin') === 'STANDBY') {
    // Server interface: serve the HTTP API until the platform stops the run.
    const port = Actor.config.get('standbyPort');
    createApiServer().listen(port, () => log.info(`Server listening on port ${port}`));
} else {
    // Input interface: push the same item as POST /add as one dataset item and exit.
    const parsed = inputSchema.safeParse((await Actor.getInput()) ?? {});
    if (!parsed.success) {
        log.error('Invalid Actor input', { error: parsed.error.message });
        await Actor.fail('Invalid Actor input');
    } else {
        await Actor.pushData(add(parsed.data));
        await Actor.exit();
    }
}
