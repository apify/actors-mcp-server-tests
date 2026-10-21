import * as z from 'zod';

// Same fields as the `AddRequest` body in `.actor/openapi.json`.
export const inputSchema = z.object({
    firstNumber: z.number().int().describe('First number to add'),
    secondNumber: z.number().int().describe('Second number to add'),
});

export type Input = z.infer<typeof inputSchema>;
