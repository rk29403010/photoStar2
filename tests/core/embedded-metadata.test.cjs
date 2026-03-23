const test = require('node:test');
const assert = require('node:assert/strict');

test('buildEmbeddedMetadataPayload preserves multiple embedded blocks and derives capture time from EXIF-like fields', async () => {
    const { buildEmbeddedMetadataPayload } = await import('../../src/services/embeddedMetadata.ts');

    const payload = buildEmbeddedMetadataPayload({
        filePath: 'C:\\photos\\scan.jpg',
        fileStats: {
            birthtime: new Date('2026-03-17T11:23:05.359Z'),
        },
        metadata: {
            format: 'jpeg',
            width: 4097,
            height: 2816,
            orientation: 1,
            exif: Buffer.from('Exif metadata block'),
            xmp: Buffer.from('<x:xmpmeta><dc:date>1944-06-01T00:00:00Z</dc:date></x:xmpmeta>', 'utf8'),
            iptc: Buffer.from('IPTC metadata block'),
            icc: Buffer.from('ICC metadata block'),
        },
        parsedExif: {
            tags: {
                DateTimeOriginal: '1944:06:01 12:34:56',
                ModifyDate: '2026:03:17 11:23:05',
            },
        },
    });

    assert.equal(payload.derived.capture_datetime, '1944-06-01T12:34:56.000Z');
    assert.equal(payload.derived.timestamp_source, 'exif.DateTimeOriginal');
    assert.equal(payload.embedded.exif.DateTimeOriginal, '1944:06:01 12:34:56');
    assert.equal(payload.embedded.exif.ModifyDate, '2026:03:17 11:23:05');
    assert.equal(payload.embedded.xmp['dc:date'], '1944-06-01T00:00:00Z');
    assert.equal(payload.embedded.iptc.byte_length, 19);
    assert.equal(payload.embedded.iptc.parse_status, 'unparsed');
    assert.equal(payload.embedded.icc.byte_length, 18);
    assert.equal(payload.embedded.icc.parse_status, 'unparsed');
});

test('buildEmbeddedMetadataPayload falls back to file birth time when no embedded capture timestamp exists', async () => {
    const { buildEmbeddedMetadataPayload } = await import('../../src/services/embeddedMetadata.ts');

    const payload = buildEmbeddedMetadataPayload({
        filePath: 'C:\\photos\\scan.jpg',
        fileStats: {
            birthtime: new Date('2026-03-17T11:23:05.359Z'),
        },
        metadata: {
            format: 'jpeg',
            width: 4097,
            height: 2816,
        },
        parsedExif: null,
    });

    assert.equal(payload.derived.capture_datetime, '2026-03-17T11:23:05.359Z');
    assert.equal(payload.derived.timestamp_source, 'file.birthtime');
});

test('buildEmbeddedMetadataPayload extracts RDF-style XMP attributes as readable field-value pairs', async () => {
    const { buildEmbeddedMetadataPayload } = await import('../../src/services/embeddedMetadata.ts');

    const payload = buildEmbeddedMetadataPayload({
        filePath: 'C:\\photos\\scan.jpg',
        fileStats: {
            birthtime: new Date('2026-03-17T11:23:05.359Z'),
        },
        metadata: {
            format: 'jpeg',
            width: 4097,
            height: 2816,
            xmp: Buffer.from(
                `<?xpacket begin='x'?>\n<x:xmpmeta><rdf:RDF><rdf:Description rdf:about="uuid:test" xmp:CreateDate="1944-06-01T00:00:00Z" photoshop:DateCreated="1944-06-01" /></rdf:RDF></x:xmpmeta>`,
                'utf8',
            ),
        },
        parsedExif: null,
    });

    assert.equal(payload.embedded.xmp['rdf:Description.@rdf:about'], 'uuid:test');
    assert.equal(payload.embedded.xmp['rdf:Description.@xmp:CreateDate'], '1944-06-01T00:00:00Z');
    assert.equal(payload.embedded.xmp['rdf:Description.@photoshop:DateCreated'], '1944-06-01');
    assert.equal(payload.derived.capture_datetime, '1944-06-01T00:00:00.000Z');
});
