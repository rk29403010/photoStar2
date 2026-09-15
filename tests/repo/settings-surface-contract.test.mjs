import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('settings surface exposes only system, local, and secret-key concerns', () => {
    const source = fs.readFileSync('src/ui/components/SettingsModal.tsx', 'utf8');

    assert.match(source, /label: 'System'/);
    assert.match(source, /label: 'Local'/);
    assert.match(source, /label: 'Secret Keys'/);
    assert.match(source, /Stored securely in the database\./);
    assert.match(source, /Saved locally - only applies to your device\./);

    assert.doesNotMatch(source, /System Settings/);
    assert.doesNotMatch(source, /UI Settings/);
    assert.doesNotMatch(source, /AI API Keys/);
    assert.doesNotMatch(source, /Registered Jobs/);
    assert.doesNotMatch(source, /Auto-Scan Strategy/);
    assert.doesNotMatch(source, /system_max_threads/);
    assert.doesNotMatch(source, /job_cluster_threshold/);
    assert.doesNotMatch(source, /job_face_matching_mode/);
    assert.doesNotMatch(source, /job_ai_model_scout/);
    assert.doesNotMatch(source, /job_ai_model_refine/);
    assert.doesNotMatch(source, /gemini_csv_path/);
});

test('retired global module and workflow overrides are cleared before runtime registration', () => {
    const source = fs.readFileSync('src/entrypoints/core/runtimeBootstrap.ts', 'utf8');

    const retiredKeys = [
        'system_max_threads',
        'workflow_auto_scan',
        'gemini_csv_path',
        'job_cluster_threshold',
        'job_face_matching_mode',
        'job_ai_model',
        'job_ai_model_scout',
        'job_ai_model_refine',
    ];
    for (const key of retiredKeys) {
        assert.match(source, new RegExp(`'${key}'`));
    }
    assert.match(source, /removeRetiredGlobalSettings\(dbManager\);[\s\S]*registerModules/);
});
