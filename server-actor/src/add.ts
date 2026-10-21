import type { Input } from './input-schema.js';

export type AddResult = Input & { sum: number };

// Same item as the normal-actor fixture pushes, so all three fixtures share one operation.
export function add({ firstNumber, secondNumber }: Input): AddResult {
    return { firstNumber, secondNumber, sum: firstNumber + secondNumber };
}
