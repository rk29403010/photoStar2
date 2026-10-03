import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export function parseArguments(argv) {
    return Object.fromEntries(argv.filter(arg => arg.startsWith('--')).map(arg => {
        const separator = arg.indexOf('=');
        return separator < 0 ? [arg.slice(2), 'true'] : [arg.slice(2, separator), arg.slice(separator + 1)];
    }));
}

function boundedRepeats(value) {
    const repeats = Number(value ?? 1);
    if (!Number.isInteger(repeats) || repeats < 1 || repeats > 100) {
        throw new Error('--repeats must be an integer between 1 and 100.');
    }
    return repeats;
}

function databasePath(args, env) {
    if (args.db || env.PHOTO_STAR_DB_PATH) { return path.resolve(args.db || env.PHOTO_STAR_DB_PATH); }
    return path.join(env.APPDATA || env.HOME || '.', 'PhotoLibraryDesktop', 'library.db');
}

function thinkingOptions(args) {
    if (args.thinkingLevel && args.thinkingBudget !== undefined) { throw new Error('Choose --thinkingLevel or --thinkingBudget.'); }
    if (args.thinkingLevel) { return { thinkingLevel: args.thinkingLevel.toUpperCase() }; }
    if (args.thinkingBudget === undefined) { return undefined; }
    const thinkingBudget = Number(args.thinkingBudget);
    if (!Number.isInteger(thinkingBudget) || thinkingBudget < -1) { throw new Error('--thinkingBudget must be an integer of at least -1.'); }
    return { thinkingBudget };
}

async function resolveTargets(args, metadataPass) {
    if (args.targets && args.targetsFile) { throw new Error('Choose --targets or --targetsFile.'); }
    const targetsText = args.targetsFile ? await fs.readFile(path.resolve(args.targetsFile), 'utf8') : args.targets;
    const targets = targetsText ? JSON.parse(targetsText) : [];
    if (!Array.isArray(targets)) { throw new Error('Refine targets must be a JSON array.'); }
    if (metadataPass === 'refine' && targets.length === 0) { throw new Error('Refine debug requires explicit --targets or --targetsFile.'); }
    return targets;
}

export async function resolveDebugOptions(args, env = process.env) {
    const metadataPass = args.metadataPass ?? 'scout';
    if (!['scout', 'refine'].includes(metadataPass)) { throw new Error('--metadataPass must be scout or refine.'); }
    const targets = await resolveTargets(args, metadataPass);
    return {
        assetSelector: (args.asset ?? '').trim(), dbPath: databasePath(args, env),
        repeats: boundedRepeats(args.repeats), metadataPass, targets,
        modelOverride: args.model?.trim() || null, promptVariant: args.promptVariant?.trim() || undefined,
        thinking: thinkingOptions(args), mediaResolution: args.mediaResolution?.toUpperCase(),
        dryRun: args.dryRun === 'true', showPrompt: args.showPrompt === 'true', showSchema: args.showSchema === 'true',
        outDir: args.outDir ? path.resolve(args.outDir) : null,
    };
}

export function hashValue(value) {
    return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

export function describeRequest(prepared) {
    const { request } = prepared;
    return {
        model: request.model,
        promptHash: hashValue(request.prompt), schemaHash: hashValue(request.responseJsonSchema),
        promptLength: request.prompt.length,
        thinking: request.thinking ?? null, mediaResolution: request.mediaResolution ?? null,
        images: request.images.map(image => ({
            id: image.id, mimeType: image.mimeType, hash: hashValue(image.imageBase64), encodedLength: image.imageBase64.length,
            mediaResolution: image.mediaResolution ?? null,
        })),
        imageManifest: prepared.images, sourceReferences: prepared.sources, faces: prepared.faces,
    };
}

export async function exportRequestArtifacts(prepared, outputDir) {
    await fs.mkdir(outputDir, { recursive: true });
    const entries = {
        'response-schema.json': prepared.request.responseJsonSchema,
        'image-manifest.json': prepared.images,
        'source-references.json': prepared.sources,
        'independent-observations.json': prepared.visualObservations ?? [],
        'targets.json': prepared.targets ?? [],
        'request-summary.json': describeRequest(prepared),
    };
    await fs.writeFile(path.join(outputDir, 'prompt.txt'), `${prepared.request.prompt}\n`, 'utf8');
    await Promise.all(Object.entries(entries).map(([name, value]) => fs.writeFile(
        path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8',
    )));
    for (const [index, image] of prepared.request.images.entries()) {
        await fs.writeFile(path.join(outputDir, `input-${index + 1}.jpg`), Buffer.from(image.imageBase64, 'base64'));
    }
}

export function resolveAssetRow(db, selector) {
    const row = db.prepare(`
        SELECT id, original_path, width, height, sensitivity_score FROM assets
        WHERE id = ? OR lower(original_path) LIKE '%' || lower(?) || '%'
        ORDER BY created_at DESC, rowid DESC LIMIT 1
    `).get(selector, selector);
    if (!row) { throw new Error(`No asset matched '${selector}'.`); }
    const manual = db.prepare(`
        SELECT am.sensitivity_status FROM assets_manual am
        JOIN asset_identities ai ON ai.guid = am.identity_guid WHERE ai.original_path = ? LIMIT 1
    `).get(row.original_path);
    return { ...row, sensitivity_status: manual?.sensitivity_status ?? null };
}

export function readOnlyDbManager(db) {
    return {
        getDb: () => db,
        getSetting: key => db.prepare('SELECT value FROM settings WHERE id = ?').get(key)?.value ?? '',
    };
}
