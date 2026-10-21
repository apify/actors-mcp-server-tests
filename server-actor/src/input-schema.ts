import * as z from 'zod';

// Same fields as the `EchoRequest` body in `.actor/openapi.json`.
export const inputSchema = z.object({
    message: z.string().describe('Text to echo'),
    count: z.number().int().min(0).default(1).describe('Number to echo'),
});

export type Input = z.infer<typeof inputSchema>;
