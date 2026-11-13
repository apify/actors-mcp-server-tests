import { Actor, Configuration, log } from 'apify';

import { inputSchema } from './input-schema.js';
import { runNormal } from './run-actor.js';

/**
 * Timeout of one Apify API request. The client's default is 360 s, longer than the run's own timeout, so a request
 * that got no response held the run until the platform timed it out (about 1 run in 800, seen in the integration
 * tests of apify-mcp-server). With a short timeout the client drops such a request and retries it.
 */
const API_REQUEST_TIMEOUT_SECS = 30;

// Must come before the first `Actor` call: the SDK builds its API client from this option on first use.
Configuration.getGlobalConfig().set('storageClientOptions', { timeoutSecs: API_REQUEST_TIMEOUT_SECS });

// Initialize the Apify Actor environment
// This call configures the Actor for its environment and should be called at startup
await Actor.init();

const rawInput = await Actor.getInput();
log.info('Read input');
let input;
try {
    input = inputSchema.parse(rawInput ?? {});
} catch (err) {
    log.error('Invalid Actor input', { error: err });
    await Actor.fail('Invalid Actor input');
}
if (input) {
    await runNormal(input);
}

// Handle server shutdown
process.on('SIGINT', async () => {
    log.info('Shutting down...');
    await Actor.exit();
});
