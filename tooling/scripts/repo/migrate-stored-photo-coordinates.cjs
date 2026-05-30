/**
 * migrate-stored-photo-coordinates.cjs
 *
 * One-off dev migration: normalises stored photo coordinate boxes in:
 *   - derived_results (task = 'face_detection')
 *   - photo_metadata_blocks
 *   - photo_metadata_projection
 *
 * This was previously run on every startup via backfillStoredPhotoCoordinates()
 * in db.ts. It is now a dev-time one-off script.
 *
 * Usage:
 *   node tooling/scripts/repo/migrate-stored-photo-coordinates.cjs
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('node:path');
const os = require('node:os');

const APP_DATA_DIR = process.env.APPDATA || os.homedir() || '.';
const dbPath = process.env.CUSTOM_DB_PATH || path.join(APP_DATA_DIR, 'PhotoLibraryDesktop', 'library.db');
console.log('Migrating Database at:', dbPath);

// ---------------------------------------------------------------------------
// Helpers (inlined from faceImageGeometry.ts + coordinateNormalization.ts)
// ---------------------------------------------------------------------------

function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

function cleanFloat(value) {
  return Number.parseFloat(value.toFixed(6));
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStoredPhotoBox(x, y, width, height) {
  if (width <= 0 || height <= 0) {return null;}
  const cx = clampUnit(x);
  const cy = clampUnit(y);
  const cr = clampUnit(x + width);
  const cb = clampUnit(y + height);
  const cw = cr - cx;
  const ch = cb - cy;
  if (cw <= 0 || ch <= 0) {return null;}
  return { x: cleanFloat(cx), y: cleanFloat(cy), width: cleanFloat(cw), height: cleanFloat(ch) };
}

function normalizeStoredPhotoBoxScale(box) {
  const scale = box.x > 1 || box.y > 1 || box.width > 1 || box.height > 1 ? 1000 : 1;
  return {
    x: cleanFloat(box.x / scale),
    y: cleanFloat(box.y / scale),
    width: cleanFloat(box.width / scale),
    height: cleanFloat(box.height / scale),
  };
}

function readStoredPhotoBoxFromRecord(value) {
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)
    || !isFiniteNumber(value.width) || !isFiniteNumber(value.height)) {return null;}
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

function readStoredPhotoBoxFromCorners(value) {
  if (value.length < 4
    || !isFiniteNumber(value[0]) || !isFiniteNumber(value[1])
    || !isFiniteNumber(value[2]) || !isFiniteNumber(value[3])) {return null;}
  return toStoredPhotoBox(value[0], value[1], value[2] - value[0], value[3] - value[1]);
}

function normalizeStoredPhotoBox(value) {
  if (Array.isArray(value)) {return readStoredPhotoBoxFromCorners(value);}
  if (!isRecord(value)) {return null;}
  const box = readStoredPhotoBoxFromRecord(value);
  if (!box) {return null;}
  const scaled = normalizeStoredPhotoBoxScale(box);
  return toStoredPhotoBox(scaled.x, scaled.y, scaled.width, scaled.height);
}

function hasCanonicalBounds(box) {
  return box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0
    && box.x <= 1 && box.y <= 1 && box.x + box.width <= 1 && box.y + box.height <= 1;
}

function isCanonicalStoredPhotoBox(value) {
  if (!isRecord(value)) {return false;}
  const box = readStoredPhotoBoxFromRecord(value);
  return box ? hasCanonicalBounds(box) : false;
}

function readCanonicalStoredPhotoBox(value) {
  return isCanonicalStoredPhotoBox(value)
    ? { x: value.x, y: value.y, width: value.width, height: value.height }
    : null;
}

// coordinateNormalization helpers

function isFinitePositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasCoordinateSpace(cs) {
  return isFinitePositive(cs?.width) && isFinitePositive(cs?.height);
}

function fitsWithinPixelDimensions(box, cs) {
  return box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0
    && box.x + box.width <= cs.width && box.y + box.height <= cs.height;
}

function isObviouslyPixelSpace(box, cs) {
  return fitsWithinPixelDimensions(box, cs)
    && (box.x > 1000 || box.y > 1000 || box.width > 1000 || box.height > 1000
      || box.x + box.width > 1000 || box.y + box.height > 1000);
}

function normalizePixelSpaceBox(box, cs) {
  return normalizeStoredPhotoBox({ x: box.x / cs.width, y: box.y / cs.height, width: box.width / cs.width, height: box.height / cs.height });
}

function readStoredPhotoBoxCandidate(value) {
  if (!isRecord(value)) {return null;}
  if (typeof value.x !== 'number' || typeof value.y !== 'number'
    || typeof value.width !== 'number' || typeof value.height !== 'number'
    || !Number.isFinite(value.x) || !Number.isFinite(value.y)
    || !Number.isFinite(value.width) || !Number.isFinite(value.height)) {return null;}
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

function resolveCanonicalBox(value, coordinateSpace) {
  const canonical = readCanonicalStoredPhotoBox(value);
  if (canonical) {return canonical;}
  if (Array.isArray(value)) {return normalizeStoredPhotoBox(value);}
  const rawBox = readStoredPhotoBoxCandidate(value);
  if (!rawBox) {return null;}
  if (hasCoordinateSpace(coordinateSpace) && isObviouslyPixelSpace(rawBox, coordinateSpace)) {
    const pixelBox = normalizePixelSpaceBox(rawBox, coordinateSpace);
    if (pixelBox) {return pixelBox;}
  }
  return normalizeStoredPhotoBox(rawBox);
}

function getBoxCenter(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function getFaceCenters(faces) {
  if (!faces) {return [];}
  return faces.map(f => f.box ? getBoxCenter(f.box) : null).filter(Boolean);
}

function getSubjectCenters(subjects) {
  return subjects
    .filter(s => (typeof s.type === 'string' ? s.type : 'person') === 'person')
    .map(s => { const box = readCanonicalStoredPhotoBox(s.bounding_box); return box ? getBoxCenter(box) : null; })
    .filter(Boolean);
}

function evaluateCandidateTranslation(cand, subjectCenters, faceCenters) {
  const TOLERANCE = 0.12;
  let matches = 0, totalDistance = 0;
  const matchedFaces = new Set();
  for (const sc of subjectCenters) {
    const tx = sc.x * cand.sx + cand.dx;
    const ty = sc.y * cand.sy + cand.dy;
    let closestFaceIdx = -1, closestDist = Infinity;
    for (let i = 0; i < faceCenters.length; i++) {
      if (matchedFaces.has(i)) {continue;}
      const d = Math.hypot(faceCenters[i].x - tx, faceCenters[i].y - ty);
      if (d < closestDist) { closestDist = d; closestFaceIdx = i; }
    }
    if (closestFaceIdx !== -1 && closestDist < TOLERANCE) {
      matches++; totalDistance += closestDist; matchedFaces.add(closestFaceIdx);
    }
  }
  return { matches, totalDistance };
}

function findBestTranslation(candidates, subjectCenters, faceCenters) {
  let best = null, maxMatches = 0, minAvgDist = Infinity;
  for (const cand of candidates) {
    const { matches, totalDistance } = evaluateCandidateTranslation(cand, subjectCenters, faceCenters);
    const avgDist = totalDistance / (matches || 1);
    if (matches > maxMatches || (matches === maxMatches && avgDist < minAvgDist)) {
      maxMatches = matches; minAvgDist = avgDist; best = cand;
    }
  }
  return maxMatches > 0 ? best : null;
}

function validateAndAlignScale(sx, sy) {
  const sxValid = sx >= 0.5 && sx <= 1.1;
  const syValid = sy >= 0.5 && sy <= 1.1;
  if (!sxValid && !syValid) {return null;}
  return { sx: sxValid ? sx : sy, sy: syValid ? sy : sx };
}

function generateTranslationCandidates(subjectCenters, faceCenters) {
  const candidates = [];
  for (const fc of faceCenters) {
    for (const sc of subjectCenters) {
      candidates.push({ sx: 1.0, sy: 1.0, dx: fc.x - sc.x, dy: fc.y - sc.y });
    }
  }

  for (let i = 0; i < subjectCenters.length; i++) {
    for (let j = i + 1; j < subjectCenters.length; j++) {
      const s1 = subjectCenters[i], s2 = subjectCenters[j];
      const dxS = s1.x - s2.x, dyS = s1.y - s2.y;
      if (Math.hypot(dxS, dyS) < 0.01) {continue;}
      for (let a = 0; a < faceCenters.length; a++) {
        for (let b = 0; b < faceCenters.length; b++) {
          if (a === b) {continue;}
          const f1 = faceCenters[a], f2 = faceCenters[b];
          const sx = Math.abs(dxS) >= 0.01 ? (f1.x - f2.x) / dxS : 1.0;
          const sy = Math.abs(dyS) >= 0.01 ? (f1.y - f2.y) / dyS : 1.0;
          const scale = validateAndAlignScale(sx, sy);
          if (!scale) {continue;}
          const dx = f1.x - scale.sx * s1.x, dy = f1.y - scale.sy * s1.y;
          if (dx >= -0.1 && dx <= 0.5 && dy >= -0.1 && dy <= 0.5)
            {candidates.push({ sx: scale.sx, sy: scale.sy, dx, dy });}
        }
      }
    }
  }
  return candidates;
}

function solveConsensusTranslation(faces, subjects) {
  if (!faces || faces.length === 0 || subjects.length === 0) {return null;}
  const faceCenters = getFaceCenters(faces);
  const subjectCenters = getSubjectCenters(subjects);
  if (faceCenters.length === 0 || subjectCenters.length === 0) {return null;}
  return findBestTranslation(generateTranslationCandidates(subjectCenters, faceCenters), subjectCenters, faceCenters);
}

function normalizePhotoMetadataBoundingBox(value, coordinateSpace, translation) {
  const canonical = resolveCanonicalBox(value, coordinateSpace);
  if (!canonical) {return null;}
  if (translation) {
    const sx = translation.sx ?? 1.0, sy = translation.sy ?? 1.0;
    const w = cleanFloat(canonical.width * sx), h = cleanFloat(canonical.height * sy);
    const x = Math.max(0, Math.min(1 - w, cleanFloat(canonical.x * sx + translation.dx)));
    const y = Math.max(0, Math.min(1 - h, cleanFloat(canonical.y * sy + translation.dy)));
    return { x, y, width: w, height: h };
  }
  return canonical;
}

// ---------------------------------------------------------------------------
// Backfill functions
// ---------------------------------------------------------------------------

function normalizeFaceDetectionPayload(data) {
  try {
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed.faces)) {return null;}
    const normalizedFaces = parsed.faces.flatMap(face => {
      const box = normalizeStoredPhotoBox(face.box);
      return box ? [{ ...face, box }] : [];
    });
    return JSON.stringify({ ...parsed, faces: normalizedFaces });
  } catch { return null; }
}

function normalizePhotoMetadataBlockPayload(data, dimensions, faces) {
  try {
    const block = JSON.parse(data);
    const translation = solveConsensusTranslation(faces, block.subjects ?? []);
    const cs = dimensions;
    const normalizeSubject = s => {
      const box = normalizePhotoMetadataBoundingBox(s.bounding_box, cs, translation);
      return box ? { ...s, bounding_box: box } : null;
    };
    const normalizeRegion = r => {
      const box = normalizePhotoMetadataBoundingBox(r.bounding_box, cs, translation);
      return box ? { ...r, bounding_box: box } : null;
    };
    return JSON.stringify({
      ...block,
      subjects: (block.subjects ?? []).map(normalizeSubject).filter(Boolean),
      regions_of_interest: (block.regions_of_interest ?? []).map(normalizeRegion).filter(Boolean),
    });
  } catch { return null; }
}

function normalizeProjectionPayload(data, kind, dimensions, faces, subjectsJson) {
  if (!data) {return data;}
  try {
    const parsed = JSON.parse(data);
    if (kind === 'subjects') {
      if (!Array.isArray(parsed)) {return JSON.stringify([]);}
      const subjects = parsed.filter(isRecord);
      const translation = solveConsensusTranslation(faces, subjects);
      return JSON.stringify(subjects.flatMap(s => {
        const box = normalizePhotoMetadataBoundingBox(s.bounding_box, dimensions, translation);
        return box ? [{ ...s, bounding_box: box }] : [];
      }));
    } else {
      if (!Array.isArray(parsed)) {return JSON.stringify([]);}
      const subjectsList = subjectsJson ? JSON.parse(subjectsJson).filter(isRecord) : [];
      const translation = solveConsensusTranslation(faces, subjectsList);
      return JSON.stringify(parsed.filter(isRecord).flatMap(r => {
        const box = normalizePhotoMetadataBoundingBox(r.bounding_box, dimensions, translation);
        return box ? [{ ...r, bounding_box: box }] : [];
      }));
    }
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

try {
  const db = new Database(dbPath);
  let updated = 0;

  db.transaction(() => {
    // 1. Face detections
    const faceRows = db.prepare(`SELECT id, data FROM derived_results WHERE task = 'face_detection'`).all();
    const updateDR = db.prepare('UPDATE derived_results SET data = ? WHERE id = ?');
    for (const row of faceRows) {
      const n = normalizeFaceDetectionPayload(row.data);
      if (n) { updateDR.run(n, row.id); updated++; }
    }

    // 2. Photo metadata blocks
    const blockRows = db.prepare(`
      SELECT b.id, b.data, a.width, a.height, b.asset_id
      FROM photo_metadata_blocks b
      JOIN assets a ON a.id = b.asset_id
    `).all();
    const updateBlock = db.prepare('UPDATE photo_metadata_blocks SET data = ? WHERE id = ?');
    for (const row of blockRows) {
      let faces = [];
      try {
        const fr = db.prepare(`SELECT data FROM derived_results WHERE asset_id = ? AND task = 'face_detection'`).get(row.asset_id);
        if (fr) {faces = JSON.parse(fr.data).faces || [];}
      } catch { /* ignore */ }
      const n = normalizePhotoMetadataBlockPayload(row.data, { width: row.width, height: row.height }, faces);
      if (n) { updateBlock.run(n, row.id); updated++; }
    }

    // 3. Metadata projections
    const projRows = db.prepare(`
      SELECT p.asset_id, p.subjects_json, p.regions_of_interest_json, a.width, a.height
      FROM photo_metadata_projection p
      JOIN assets a ON a.id = p.asset_id
    `).all();
    const updateProj = db.prepare(`
      UPDATE photo_metadata_projection SET subjects_json = ?, regions_of_interest_json = ?, updated_at = CURRENT_TIMESTAMP WHERE asset_id = ?
    `);
    for (const row of projRows) {
      let faces = [];
      try {
        const fr = db.prepare(`SELECT data FROM derived_results WHERE asset_id = ? AND task = 'face_detection'`).get(row.asset_id);
        if (fr) {faces = JSON.parse(fr.data).faces || [];}
      } catch { /* ignore */ }
      const cs = { width: row.width, height: row.height };
      const sj = normalizeProjectionPayload(row.subjects_json, 'subjects', cs, faces) ?? row.subjects_json;
      const rj = normalizeProjectionPayload(row.regions_of_interest_json, 'regions', cs, faces, row.subjects_json) ?? row.regions_of_interest_json;
      updateProj.run(sj, rj, row.asset_id);
      updated++;
    }
  })();

  console.log(`Successfully migrated ${updated} rows.`);
  db.close();
} catch (e) {
  console.error('Migration failed:', e);
  process.exit(1);
}
