import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const outputRoot = path.join(repoRoot, 'tests', 'fixtures', 'grouping-permutations');

const CANVAS_SIZE = 512;
const BACKGROUND = '#f7f7f2';

const subjectBlueprints = {
    'blue-circle': { shape: 'circle', color: '#2563eb' },
    'red-triangle': { shape: 'triangle', color: '#dc2626' },
    'green-square': { shape: 'square', color: '#16a34a' },
    'yellow-circle': { shape: 'circle', color: '#eab308' },
    'orange-star': { shape: 'star', color: '#ea580c' },
    'purple-hex': { shape: 'hexagon', color: '#9333ea' },
    'teal-diamond': { shape: 'diamond', color: '#0f766e' },
    'pink-cross': { shape: 'cross', color: '#db2777' },
    'lime-pentagon': { shape: 'pentagon', color: '#65a30d' },
    'navy-arrow': { shape: 'arrow', color: '#1d4ed8' },
    'brown-moon': { shape: 'moon', color: '#92400e' },
    'black-ring': { shape: 'ring', color: '#1f2937' },
    'cyan-wave': { shape: 'wave', color: '#0891b2' },
    'olive-bolt': { shape: 'bolt', color: '#4d7c0f' },
    'maroon-fan': { shape: 'fan', color: '#9f1239' },
    'silver-clover': { shape: 'clover', color: '#64748b' },
};

const caseDefinitions = [
    makeCase('01', 'solo', 'blue-circle', [
        file('a', 'base', 'png', '2026-01-01T12:00:00.000Z'),
    ]),
    makeCase('02', 'dup', 'red-triangle', [
        file('a', 'base', 'png', '2026-01-01T12:10:00.000Z'),
        file('b', 'copy', 'png', '2026-01-01T12:10:01.000Z', { sourceRole: 'a' }),
    ]),
    makeCase('03', 'near', 'green-square', [
        file('a', 'base', 'png', '2026-01-01T12:20:00.000Z'),
        file('b', 'near', 'jpg', '2026-01-01T12:20:05.000Z'),
    ]),
    makeCase('04', 'variant', 'yellow-circle', [
        file('a', 'base', 'png', '2026-01-01T12:30:00.000Z'),
        file('b', 'variant', 'png', '2026-01-01T12:30:08.000Z'),
    ]),
    makeCase('05', 'burst', 'orange-star', [
        file('a', 'burst-1', 'jpg', '2026-01-01T12:40:00.000Z'),
        file('b', 'burst-2', 'jpg', '2026-01-01T12:40:01.000Z'),
        file('c', 'burst-3', 'jpg', '2026-01-01T12:40:02.000Z'),
    ]),
    makeCase('06', 'dup-near', 'purple-hex', [
        file('a', 'base', 'png', '2026-01-01T12:50:00.000Z'),
        file('a-copy', 'copy', 'png', '2026-01-01T12:50:01.000Z', { sourceRole: 'a' }),
        file('b', 'near', 'jpg', '2026-01-01T12:50:05.000Z'),
    ]),
    makeCase('07', 'dup-variant', 'teal-diamond', [
        file('a', 'base', 'png', '2026-01-01T13:00:00.000Z'),
        file('a-copy', 'copy', 'png', '2026-01-01T13:00:01.000Z', { sourceRole: 'a' }),
        file('b', 'variant', 'png', '2026-01-01T13:00:10.000Z'),
    ]),
    makeCase('08', 'dup-burst', 'pink-cross', [
        file('a', 'base', 'jpg', '2026-01-01T13:10:00.000Z'),
        file('a-copy', 'copy', 'jpg', '2026-01-01T13:10:01.000Z', { sourceRole: 'a' }),
        file('b', 'burst-2', 'jpg', '2026-01-01T13:10:02.000Z'),
    ]),
    makeCase('09', 'near-variant', 'lime-pentagon', [
        file('a', 'base', 'png', '2026-01-01T13:20:00.000Z'),
        file('b', 'near', 'jpg', '2026-01-01T13:20:04.000Z'),
        file('c', 'variant', 'png', '2026-01-01T13:20:10.000Z'),
    ]),
    makeCase('10', 'near-burst', 'navy-arrow', [
        file('a', 'base', 'jpg', '2026-01-01T13:30:00.000Z'),
        file('b', 'near', 'jpg', '2026-01-01T13:30:01.000Z'),
        file('c', 'burst-3', 'jpg', '2026-01-01T13:30:02.000Z'),
    ]),
    makeCase('11', 'variant-burst', 'brown-moon', [
        file('a', 'variant', 'jpg', '2026-01-01T13:40:00.000Z'),
        file('b', 'variant-soft', 'jpg', '2026-01-01T13:40:01.000Z'),
        file('c', 'burst-2', 'jpg', '2026-01-01T13:40:02.000Z'),
    ]),
    makeCase('12', 'dup-near-variant', 'black-ring', [
        file('a', 'base', 'png', '2026-01-01T13:50:00.000Z'),
        file('a-copy', 'copy', 'png', '2026-01-01T13:50:01.000Z', { sourceRole: 'a' }),
        file('b', 'near', 'jpg', '2026-01-01T13:50:04.000Z'),
        file('c', 'variant', 'png', '2026-01-01T13:50:10.000Z'),
    ]),
    makeCase('13', 'dup-near-burst', 'cyan-wave', [
        file('a', 'base', 'jpg', '2026-01-01T14:00:00.000Z'),
        file('a-copy', 'copy', 'jpg', '2026-01-01T14:00:00.500Z', { sourceRole: 'a' }),
        file('b', 'near', 'jpg', '2026-01-01T14:00:01.000Z'),
        file('c', 'burst-3', 'jpg', '2026-01-01T14:00:02.000Z'),
    ]),
    makeCase('14', 'dup-variant-burst', 'olive-bolt', [
        file('a', 'base', 'jpg', '2026-01-01T14:10:00.000Z'),
        file('a-copy', 'copy', 'jpg', '2026-01-01T14:10:00.500Z', { sourceRole: 'a' }),
        file('b', 'variant', 'jpg', '2026-01-01T14:10:01.000Z'),
        file('c', 'burst-2', 'jpg', '2026-01-01T14:10:02.000Z'),
    ]),
    makeCase('15', 'near-variant-burst', 'maroon-fan', [
        file('a', 'base', 'jpg', '2026-01-01T14:20:00.000Z'),
        file('b', 'near', 'jpg', '2026-01-01T14:20:01.000Z'),
        file('c', 'variant', 'jpg', '2026-01-01T14:20:02.000Z'),
        file('d', 'burst-3', 'jpg', '2026-01-01T14:20:03.000Z'),
    ]),
    makeCase('16', 'dup-near-variant-burst', 'silver-clover', [
        file('a', 'base', 'jpg', '2026-01-01T14:30:00.000Z'),
        file('a-copy', 'copy', 'jpg', '2026-01-01T14:30:00.500Z', { sourceRole: 'a' }),
        file('b', 'near', 'jpg', '2026-01-01T14:30:01.000Z'),
        file('c', 'variant', 'jpg', '2026-01-01T14:30:02.000Z'),
        file('d', 'burst-3', 'jpg', '2026-01-01T14:30:03.000Z'),
    ]),
];

function makeCase(id, combo, subject, files) {
    return {
        id,
        combo,
        subject,
        expectedGroups: combo === 'solo' ? [] : combo.split('-'),
        files,
    };
}

function file(role, variant, extension, captureAt, extra = {}) {
    return {
        role,
        variant,
        extension,
        captureAt,
        ...extra,
    };
}

function getPoints(shape) {
    switch (shape) {
        case 'triangle':
            return '256,86 410,372 102,372';
        case 'square':
            return '118,118 394,118 394,394 118,394';
        case 'diamond':
            return '256,86 414,256 256,426 98,256';
        case 'pentagon':
            return '256,78 406,190 348,392 164,392 106,190';
        case 'hexagon':
            return '166,92 346,92 436,256 346,420 166,420 76,256';
        case 'star':
            return '256,72 301,189 427,196 330,276 362,396 256,326 150,396 182,276 85,196 211,189';
        case 'cross':
            return '198,82 314,82 314,198 430,198 430,314 314,314 314,430 198,430 198,314 82,314 82,198 198,198';
        case 'arrow':
            return '118,168 274,168 274,102 422,256 274,410 274,344 118,344';
        case 'bolt':
            return '304,74 180,242 258,242 206,438 332,262 252,262';
        case 'fan':
            return '124,402 164,144 256,98 348,144 388,402';
        default:
            return '';
    }
}

function shapeMarkup(shape, color) {
    switch (shape) {
        case 'circle':
            return `<circle cx="256" cy="256" r="146" fill="${color}" />`;
        case 'triangle':
        case 'square':
        case 'diamond':
        case 'pentagon':
        case 'hexagon':
        case 'star':
        case 'cross':
        case 'arrow':
        case 'bolt':
        case 'fan':
            return `<polygon points="${getPoints(shape)}" fill="${color}" />`;
        case 'moon':
            return [
                `<circle cx="256" cy="256" r="148" fill="${color}" />`,
                `<circle cx="310" cy="220" r="128" fill="${BACKGROUND}" />`,
            ].join('');
        case 'ring':
            return [
                `<circle cx="256" cy="256" r="150" fill="${color}" />`,
                `<circle cx="256" cy="256" r="88" fill="${BACKGROUND}" />`,
            ].join('');
        case 'wave':
            return `<path d="M72 276 C126 188 174 188 228 276 S330 364 386 276 S438 188 440 276 L440 360 L72 360 Z" fill="${color}" />`;
        case 'clover':
            return [
                `<circle cx="208" cy="196" r="70" fill="${color}" />`,
                `<circle cx="304" cy="196" r="70" fill="${color}" />`,
                `<circle cx="208" cy="300" r="70" fill="${color}" />`,
                `<circle cx="304" cy="300" r="70" fill="${color}" />`,
                `<rect x="242" y="300" width="28" height="108" rx="14" fill="${color}" />`,
            ].join('');
        default:
            throw new Error(`Unsupported shape: ${shape}`);
    }
}

function getVariantTransform(variant) {
    switch (variant) {
        case 'base':
        case 'copy':
            return { rotate: 0, scale: 1, tx: 0, ty: 0, accent: 'none', jpegQuality: 100 };
        case 'near':
            return { rotate: 0, scale: 1, tx: 3, ty: -2, accent: 'shadow', jpegQuality: 94 };
        case 'variant':
            return { rotate: 12, scale: 0.86, tx: 12, ty: 10, accent: 'badge', jpegQuality: 98 };
        case 'variant-soft':
            return { rotate: 7, scale: 0.9, tx: -10, ty: 6, accent: 'shadow', jpegQuality: 97 };
        case 'burst-1':
            return { rotate: -4, scale: 0.96, tx: -14, ty: 4, accent: 'none', jpegQuality: 96 };
        case 'burst-2':
            return { rotate: 0, scale: 1, tx: 10, ty: -8, accent: 'shadow', jpegQuality: 96 };
        case 'burst-3':
            return { rotate: 5, scale: 0.95, tx: 22, ty: 12, accent: 'none', jpegQuality: 96 };
        default:
            throw new Error(`Unsupported variant: ${variant}`);
    }
}

function getAccentMarkup(accent, color) {
    switch (accent) {
        case 'none':
            return '';
        case 'shadow':
            return `<ellipse cx="256" cy="400" rx="118" ry="28" fill="${color}" opacity="0.12" />`;
        case 'badge':
            return [
                `<circle cx="368" cy="144" r="42" fill="${color}" opacity="0.18" />`,
                `<circle cx="368" cy="144" r="24" fill="${color}" opacity="0.30" />`,
            ].join('');
        default:
            return '';
    }
}

function buildSvg(subject, variant) {
    const blueprint = subjectBlueprints[subject];
    const transform = getVariantTransform(variant);
    const rotation = `rotate(${transform.rotate} 256 256)`;
    const translation = `translate(${transform.tx} ${transform.ty})`;
    const scale = `translate(256 256) scale(${transform.scale}) translate(-256 -256)`;

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}">`,
        `<rect width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" rx="36" fill="${BACKGROUND}" />`,
        `<rect x="28" y="28" width="456" height="456" rx="28" fill="#ffffff" stroke="#e5e7eb" stroke-width="6" />`,
        getAccentMarkup(transform.accent, blueprint.color),
        `<g transform="${translation} ${rotation} ${scale}">`,
        shapeMarkup(blueprint.shape, blueprint.color),
        `</g>`,
        `</svg>`,
    ].join('');
}

function toExifTimestamp(isoString) {
    const date = new Date(isoString);
    const year = date.getUTCFullYear();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${date.getUTCDate()}`.padStart(2, '0');
    const hours = `${date.getUTCHours()}`.padStart(2, '0');
    const minutes = `${date.getUTCMinutes()}`.padStart(2, '0');
    const seconds = `${date.getUTCSeconds()}`.padStart(2, '0');
    return `${year}:${month}:${day} ${hours}:${minutes}:${seconds}`;
}

async function renderImage(subject, variant, extension, captureAt) {
    const svg = buildSvg(subject, variant);
    const base = sharp(Buffer.from(svg));
    const exifValue = toExifTimestamp(captureAt);
    const pipeline = base.withExif({
        IFD0: {
            Software: 'photoStar2 fixture generator',
            Artist: 'Codex',
            DateTime: exifValue,
        },
        Exif: {
            DateTimeOriginal: exifValue,
            DateTimeDigitized: exifValue,
        },
    });

    if (extension === 'jpg') {
        return pipeline.jpeg({
            quality: getVariantTransform(variant).jpegQuality,
            chromaSubsampling: '4:4:4',
        }).toBuffer();
    }

    if (extension === 'png') {
        return pipeline.png({
            compressionLevel: 9,
        }).toBuffer();
    }

    throw new Error(`Unsupported extension: ${extension}`);
}

function setWindowsTimestamp(filePath, captureAt) {
    const escapedPath = filePath.replaceAll('\'', "''");
    const command = [
        `$ts = [datetime]'${captureAt}'`,
        `[System.IO.File]::SetCreationTimeUtc('${escapedPath}', $ts.ToUniversalTime())`,
        `[System.IO.File]::SetLastWriteTimeUtc('${escapedPath}', $ts.ToUniversalTime())`,
        `[System.IO.File]::SetLastAccessTimeUtc('${escapedPath}', $ts.ToUniversalTime())`,
    ].join('; ');
    execFileSync('powershell.exe', ['-NoProfile', '-Command', command], {
        stdio: 'ignore',
    });
}

async function writeCase(caseDefinition) {
    const caseFolderName = `${caseDefinition.id}__${caseDefinition.combo}__${caseDefinition.subject}`;
    const caseDir = path.join(outputRoot, caseFolderName);
    await fs.mkdir(caseDir, { recursive: true });

    const writtenFiles = new Map();
    for (const fixture of caseDefinition.files) {
        const fileName = `${caseDefinition.id}__${caseDefinition.combo}__${caseDefinition.subject}__${fixture.role}.${fixture.extension}`;
        const filePath = path.join(caseDir, fileName);

        if (fixture.variant === 'copy') {
            const sourcePath = writtenFiles.get(fixture.sourceRole);
            if (!sourcePath) {
                throw new Error(`Missing copy source ${fixture.sourceRole} for ${fileName}`);
            }
            await fs.copyFile(sourcePath, filePath);
        } else {
            const imageBuffer = await renderImage(
                caseDefinition.subject,
                fixture.variant,
                fixture.extension,
                fixture.captureAt,
            );
            await fs.writeFile(filePath, imageBuffer);
        }

        setWindowsTimestamp(filePath, fixture.captureAt);
        writtenFiles.set(fixture.role, filePath);
    }

    return {
        ...caseDefinition,
        folder: caseFolderName,
        files: caseDefinition.files.map((fixture) => ({
            ...fixture,
            fileName: `${caseDefinition.id}__${caseDefinition.combo}__${caseDefinition.subject}__${fixture.role}.${fixture.extension}`,
        })),
    };
}

function buildManifest(cases) {
    return {
        generatedAt: new Date().toISOString(),
        root: 'tests/fixtures/grouping-permutations',
        notes: [
            'Each case lives in its own folder to reduce accidental cross-grouping.',
            'Burst-oriented files are stamped with close capture timestamps.',
            'Duplicate files are byte-identical copies of their source file.',
            'Near, variant, and burst images are simple visual permutations of a base shape.',
            'Expected groups describe the intended hierarchy for manual testing and may still be influenced by runtime thresholds.',
        ],
        cases,
    };
}

function buildReadme(manifest) {
    const lines = [
        '# Grouping Fixture Pack',
        '',
        'Generated fixture set for manual grouping-system testing.',
        '',
        '## Coverage',
        '',
        '- Non-people grouping hierarchy: `duplicate -> near_duplicate -> variant_set -> burst`',
        '- 16 case folders',
        `- ${manifest.cases.reduce((sum, entry) => sum + entry.files.length, 0)} image files`,
        '',
        '## Naming',
        '',
        '`NN__combo__subject__role.ext`',
        '',
        '## Cases',
        '',
    ];

    for (const entry of manifest.cases) {
        const expected = entry.expectedGroups.length > 0 ? entry.expectedGroups.join(' -> ') : 'none';
        lines.push(`- \`${entry.folder}\`: expected groups ${expected}`);
    }

    lines.push('', '## Machine-readable manifest', '', '- `manifest.json`');
    return `${lines.join('\n')}\n`;
}

async function main() {
    await fs.rm(outputRoot, { recursive: true, force: true });
    await fs.mkdir(outputRoot, { recursive: true });

    const generatedCases = [];
    for (const caseDefinition of caseDefinitions) {
        generatedCases.push(await writeCase(caseDefinition));
    }

    const manifest = buildManifest(generatedCases);
    await fs.writeFile(
        path.join(outputRoot, 'manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8',
    );
    await fs.writeFile(
        path.join(outputRoot, 'README.md'),
        buildReadme(manifest),
        'utf8',
    );

    console.log(`Generated ${generatedCases.length} grouping fixture cases in ${outputRoot}`);
}

await main();
