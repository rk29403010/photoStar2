export type PerceptionGenerativeAction = 'remove' | 'simplify';

export type PerceptionGenerativeRequest = {
    action: PerceptionGenerativeAction;
    instruction: string;
    preservePeople?: boolean;
};

function actionInstruction(action: PerceptionGenerativeAction): string {
    return action === 'remove'
        ? 'Remove only the unwanted element inside the supplied edit region and reconstruct only the background it physically occludes.'
        : 'Simplify only the supplied edit region so it attracts less attention while preserving plausible scene context.';
}

export function buildPerceptionGenerativePrompt(request: PerceptionGenerativeRequest): string {
    const instruction = request.instruction.trim();
    if (!instruction) {
        throw new Error('Perception generative edits require an explicit instruction.');
    }
    const peopleGuard = request.preservePeople === false
        ? ''
        : ' Preserve every person exactly: identity, face, expression, body shape, pose, clothing, hair and skin must not be altered.';
    return [
        'Perform a tightly localised photographic edit.',
        actionInstruction(request.action),
        `Requested change: ${instruction}`,
        'Treat the supplied region as a hard edit boundary. Do not beautify, relight, restyle, crop, reframe or reinterpret the rest of the photograph.',
        `${peopleGuard} Preserve geometry, perspective, lighting direction, colour relationships, texture, grain and photographic character outside the minimum reconstruction area.`.trim(),
        'Do not invent new objects, people, text or decorative detail. Prefer the smallest plausible reconstruction that satisfies the requested change.',
    ].filter(Boolean).join(' ');
}
