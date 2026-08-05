/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Asset } from '../../../boundary/contracts/core.ts';
import {
    buildSinglePhotoPeopleModel,
    getSinglePhotoPeopleColor,
} from './singlePhotoPeopleModel.ts';

const asset: Asset = {
    id: 'asset-1',
    original_path: 'C:\\photos\\family.jpg',
    width: 1000,
    height: 800,
    faces: [
        {
            box: { x: 0.1, y: 0.2, width: 0.2, height: 0.3 },
        },
        {
            box: { x: 0.4, y: 0.15, width: 0.25, height: 0.4 },
            person_id: 'person-1',
            person_name: 'Alex',
        },
    ],
    photo_metadata: {
        projection: {
            assetId: 'asset-1',
            type: null,
            caption: null,
            description: null,
            location: null,
            estimatedDate: {
                most_likely_date: null,
                min_date: null,
                max_date: null,
                display_label: null,
                rationale: null,
            },
            keywords: [],
            emotionalImpact: null,
            quality: {
                technical: null,
                lighting: null,
                composition: null,
                emotional: null,
                discard: null,
            },
            recommendedEnhancements: [],
            authenticity: {
                score: null,
                reasons: [],
            },
            subjects: [
                {
                    label: 'Subject 1',
                    type: 'person',
                    location_desc: 'right side',
                    gender: 'unknown',
                    animal_type: null,
                    age_range: null,
                    dob_range: null,
                    emotion: 'happy',
                    gaze: null,
                    features: 'wearing glasses',
                    uniform: null,
                    suggested_names: ['Maybe Jordan'],
                    bounding_box: { x: 0.7, y: 0.14, width: 0.18, height: 0.32 },
                },
            ],
            regionsOfInterest: [
                {
                    label: 'Badge',
                    kind: 'clothing',
                    significance: 'Could help identify the event era.',
                    bounding_box: { x: 0.25, y: 0.5, width: 0.12, height: 0.11 },
                },
            ],
        },
        provenance: {
            subjects: {
                sourceKind: 'gemini_pro_refined',
                sourceId: 'subject-source-1',
            },
            regionsOfInterest: {
                sourceKind: 'gemini_flash_scout',
                sourceId: 'roi-source-1',
            },
        },
        evidence: {
            machineBlocks: [],
            manualAssertions: [],
        },
    },
    mask_metadata: {
        schemaVersion: 1,
        masks: [
            {
                id: 'lamp',
                label: 'Table lamp',
                description: 'Locally segmented object',
                kind: 'polygon',
                points: [
                    { x: 0.12, y: 0.62 },
                    { x: 0.2, y: 0.54 },
                    { x: 0.28, y: 0.64 },
                    { x: 0.24, y: 0.76 },
                    { x: 0.14, y: 0.74 },
                ],
                source: { moduleId: 'runtime.segment_objects', referenceId: 'lamp' },
            },
            {
                id: 'photo-content',
                label: 'Detected photo area',
                description: 'Frame mask',
                kind: 'polygon',
                points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
                source: { moduleId: 'runtime.detect_frame', referenceId: 'photo-content' },
            },
        ],
    },
};

void test('buildSinglePhotoPeopleModel normalizes local faces, resolved people, AI subjects, and ROI regions', () => {
    const model = buildSinglePhotoPeopleModel(asset);

    assert.equal(model.peopleItems.length, 3);
    assert.deepEqual(
        model.peopleItems.map((item) => ({ key: item.key, kind: item.kind, label: item.label })),
        [
            { key: 'face-0', kind: 'local-face', label: 'Unknown person' },
            { key: 'face-1', kind: 'resolved-person', label: 'Alex' },
            { key: 'subject-0', kind: 'remote-subject', label: 'Subject 1' },
        ],
    );

    assert.deepEqual(
        model.regionsOfInterest.map((item) => ({ key: item.key, kind: item.kind, label: item.label, sourceLabel: item.sourceLabel })),
        [
            {
                key: 'roi-0',
                kind: 'region-of-interest',
                label: 'Badge',
                sourceLabel: 'Flash scout',
            },
        ],
    );

    assert.deepEqual(model.peopleItems[2]?.box, {
        x: 0.7,
        y: 0.14,
        w: 0.18,
        h: 0.32,
    });

    assert.deepEqual(
        model.segmentedObjects.map((item) => ({ key: item.key, kind: item.kind, label: item.label, sourceLabel: item.sourceLabel })),
        [{
            key: 'mask-runtime.segment_objects-lamp',
            kind: 'segmented-object',
            label: 'Table lamp',
            sourceLabel: 'runtime.segment_objects',
        }],
    );
    assert.equal(model.segmentedObjects[0]?.points?.length, 5);
});

void test('buildSinglePhotoPeopleModel ignores legacy mixed-scale boxes instead of guessing their units', () => {
    const model = buildSinglePhotoPeopleModel({
        ...asset,
        photo_metadata: {
            ...asset.photo_metadata!,
            projection: {
                ...asset.photo_metadata!.projection,
                subjects: [{
                    label: 'Legacy Subject',
                    type: 'person',
                    location_desc: 'left side',
                    gender: null,
                    animal_type: null,
                    age_range: null,
                    dob_range: null,
                    emotion: null,
                    gaze: null,
                    features: null,
                    uniform: null,
                    suggested_names: [],
                    bounding_box: { x: 700, y: 140, width: 180, height: 320 },
                }],
                regionsOfInterest: [],
            },
        },
    });

    assert.equal(model.peopleItems.some((item) => item.label === 'Legacy Subject'), false);
});
void test('getSinglePhotoPeopleColor returns distinct palettes for each overlay source', () => {
    const local = getSinglePhotoPeopleColor('local-face');
    const resolved = getSinglePhotoPeopleColor('resolved-person');
    const remote = getSinglePhotoPeopleColor('remote-subject');
    const roi = getSinglePhotoPeopleColor('region-of-interest');
    const segmentedObject = getSinglePhotoPeopleColor('segmented-object');

    assert.notEqual(local.border, resolved.border);
    assert.notEqual(local.border, remote.border);
    assert.notEqual(resolved.border, remote.border);
    assert.notEqual(remote.border, roi.border);
    assert.notEqual(roi.border, segmentedObject.border);
});
