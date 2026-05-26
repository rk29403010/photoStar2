import Database from 'better-sqlite3';
import { join } from 'node:path';
import process from 'node:process';

const dbPath = join(process.env.APPDATA, 'PhotoLibraryDesktop', 'library.db');
const db = new Database(dbPath);

function getBoxCenter(box) {
    return {
        x: box.x + (box.width ?? box.w ?? 0) / 2,
        y: box.y + (box.height ?? box.h ?? 0) / 2
    };
}

function solveConsensusTranslation(faces, subjects) {
    if (faces.length === 0 || subjects.length === 0) {
        return null;
    }

    const personSubjects = subjects.filter(s => (s.type ?? 'person') === 'person');
    if (personSubjects.length === 0) {
        return null;
    }

    const faceCenters = faces.map(f => getBoxCenter(f.box));
    const subjectCenters = personSubjects.map(s => getBoxCenter(s.bounding_box));

    // Generate all candidate translations
    const candidates = [];
    for (const fc of faceCenters) {
        for (const sc of subjectCenters) {
            candidates.push({
                dx: fc.x - sc.x,
                dy: fc.y - sc.y
            });
        }
    }

    // Evaluate candidates
    let bestTranslation = null;
    let maxMatchCount = 0;
    let minAverageDistance = Infinity;

    const TOLERANCE = 0.12; // Allow some slack for differences in box definition

    for (const cand of candidates) {
        let matches = 0;
        let totalDistance = 0;
        const matchedFaces = new Set();

        for (const sc of subjectCenters) {
            const shiftedX = sc.x + cand.dx;
            const shiftedY = sc.y + cand.dy;

            // Find closest face
            let closestFaceIdx = -1;
            let closestDist = Infinity;

            for (let i = 0; i < faceCenters.length; i++) {
                if (matchedFaces.has(i)) {continue;}
                const fc = faceCenters[i];
                const dist = Math.hypot(fc.x - shiftedX, fc.y - shiftedY);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestFaceIdx = i;
                }
            }

            if (closestFaceIdx !== -1 && closestDist < TOLERANCE) {
                matches++;
                totalDistance += closestDist;
                matchedFaces.add(closestFaceIdx);
            }
        }

        if (matches > maxMatchCount || (matches === maxMatchCount && totalDistance / (matches || 1) < minAverageDistance)) {
            maxMatchCount = matches;
            minAverageDistance = totalDistance / (matches || 1);
            bestTranslation = cand;
        }
    }

    if (maxMatchCount > 0) {
        return bestTranslation;
    }
    return null;
}

const files = ['094323-082918_03.jpg', '022413-092218_01.jpg', '221421-082918_05.jpg'];

for (const file of files) {
    const asset = db.prepare("SELECT * FROM assets WHERE original_path LIKE ?").get(`%${file}%`);
    if (asset) {
        console.log('==================================================');
        console.log('File:', file);
        
        const facesRow = db.prepare("SELECT * FROM derived_results WHERE asset_id = ? AND task = 'face_detection'").get(asset.id);
        const faces = facesRow ? JSON.parse(facesRow.data).faces : [];
        
        const projection = db.prepare("SELECT * FROM photo_metadata_projection WHERE asset_id = ?").get(asset.id);
        const subjects = projection ? JSON.parse(projection.subjects_json) : [];
        const rois = projection ? JSON.parse(projection.regions_of_interest_json) : [];

        const translation = solveConsensusTranslation(faces, subjects);
        console.log('Computed Translation:', translation);

        if (translation) {
            console.log('Original vs Corrected Subjects:');
            for (const s of subjects) {
                const origCenter = getBoxCenter(s.bounding_box);
                const correctedCenter = { x: origCenter.x + translation.dx, y: origCenter.y + translation.dy };
                console.log(`  - ${s.label}:`);
                console.log(`    Original Center: (${origCenter.x.toFixed(3)}, ${origCenter.y.toFixed(3)})`);
                console.log(`    Corrected Center: (${correctedCenter.x.toFixed(3)}, ${correctedCenter.y.toFixed(3)})`);
            }
        }
    }
}

db.close();
