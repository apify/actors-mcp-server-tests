import type { Input } from './input-schema.js';

export const MOTTO = 'An agent is only as good as its tools.';

export type Tool = {
    id: string;
    name: string;
    job: string;
    withoutIt: string;
    keywords: string[];
};

export const TOOLS: Tool[] = [
    {
        id: 'api-schema',
        name: 'API schema',
        job: 'Lists the endpoints a server really has.',
        withoutIt: 'The agent guesses URLs and collects 404s.',
        keywords: ['api', 'endpoint', 'http', 'openapi', 'server', 'request'],
    },
    {
        id: 'input-schema',
        name: 'Input schema',
        job: 'Says which fields a run accepts.',
        withoutIt: 'The agent invents parameters and hopes.',
        keywords: ['input', 'run', 'parameter', 'field', 'form'],
    },
    {
        id: 'web-browser',
        name: 'Web browser',
        job: 'Reads pages the model has never seen.',
        withoutIt: 'The agent answers from its training cutoff and calls it news.',
        keywords: ['web', 'page', 'brows', 'read', 'news', 'search', 'research', 'url'],
    },
    {
        id: 'scraper',
        name: 'Scraper',
        job: 'Turns a website into rows.',
        withoutIt: 'The agent copies tables by hand, one hallucinated cell at a time.',
        keywords: ['scrap', 'extract', 'price', 'product', 'listing', 'table', 'crawl', 'data'],
    },
    {
        id: 'proxy',
        name: 'Proxy',
        job: 'Gets past rate limits and geo-blocks politely.',
        withoutIt: 'The agent meets its first CAPTCHA and gives up.',
        keywords: ['proxy', 'block', 'captcha', 'country', 'rate', 'limit'],
    },
    {
        id: 'storage',
        name: 'Storage',
        job: 'Keeps results after the run ends.',
        withoutIt: 'The work disappears with the context window.',
        keywords: ['sav', 'stor', 'dataset', 'file', 'export', 'csv', 'keep'],
    },
    {
        id: 'scheduler',
        name: 'Scheduler',
        job: 'Runs the job again tomorrow morning.',
        withoutIt: 'The agent promises to check back and never does.',
        keywords: ['daily', 'every', 'schedul', 'monitor', 'watch', 'track', 'weekly'],
    },
    {
        id: 'mcp',
        name: 'MCP server',
        job: "Speaks the agent's own protocol.",
        withoutIt: 'The agent reads docs and writes curl commands by hand.',
        keywords: ['mcp', 'agent', 'tool', 'llm', 'claude', 'assistant'],
    },
];

export type Recommendation = Input & {
    tools: (Pick<Tool, 'id' | 'name' | 'job' | 'withoutIt'> & { matched: string[] })[];
    motto: string;
};

function toPublicTool({ id, name, job, withoutIt }: Tool) {
    return { id, name, job, withoutIt };
}

export function listTools() {
    return TOOLS.map(toPublicTool);
}

export function findTool(id: string) {
    const tool = TOOLS.find((t) => t.id === id);
    return tool ? toPublicTool(tool) : null;
}

/**
 * Picks up to `maxTools` tools with a keyword that starts a word of the task, most matches first.
 * Deterministic: ties keep catalog order. With no match, returns the two schemas,
 * since an agent that does not know what to do should read them first.
 */
export function recommend({ task, maxTools }: Input): Recommendation {
    const words = task.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const scored = TOOLS.map((tool) => ({
        tool,
        matched: tool.keywords.filter((k) => words.some((w) => w.startsWith(k))),
    }))
        .filter(({ matched }) => matched.length > 0)
        .sort((a, b) => b.matched.length - a.matched.length);
    const picked = scored.length > 0 ? scored : TOOLS.slice(0, 2).map((tool) => ({ tool, matched: [] }));
    return {
        task,
        maxTools,
        tools: picked.slice(0, maxTools).map(({ tool, matched }) => ({ ...toPublicTool(tool), matched })),
        motto: MOTTO,
    };
}
