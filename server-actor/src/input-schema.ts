import * as z from 'zod';

// Same fields as the `TaskRequest` body in `.actor/openapi.json`.
export const inputSchema = z.object({
    task: z.string().min(1).describe('What the agent is trying to do'),
    maxTools: z.number().int().min(1).max(8).default(3).describe('Maximum number of tools to recommend'),
});

export type Input = z.infer<typeof inputSchema>;
