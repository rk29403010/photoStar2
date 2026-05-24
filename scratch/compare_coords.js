import Database from 'better-sqlite3';
import { join } from 'node:path';
import process from 'node:process';

const dbPath = join(process.env.APPDATA, 'PhotoLibraryDesktop', 'library.db');
const db = new Database(dbPath);

const files = ['094323-082918_03.jpg', '022413-092218_01.jpg', '221421-082918_05.jpg'];

for (const file of files) {
    const asset = db.prepare("SELECT * FROM assets WHERE original_path LIKE ?").get(`%${file}%`);
    if (asset) {
        console.log('--------------------------------------------------');
        console.log('File:', file, 'Size:', asset.width, 'x', asset.height);
        
        const facesRow = db.prepare("SELECT * FROM derived_results WHERE asset_id = ? AND task = 'face_detection'").get(asset.id);
        const faces = facesRow ? JSON.parse(facesRow.data).faces : [];
        console.log('Local face boxes:');
        for (const face of faces) {
            console.log(`  - x: ${face.box.x}, y: ${face.box.y}, w: ${face.box.width}, h: ${face.box.height} (center X: ${(face.box.x + face.box.width/2).toFixed(3)}, center Y: ${(face.box.y + face.box.height/2).toFixed(3)})`);
        }
        
        const projection = db.prepare("SELECT * FROM photo_metadata_projection WHERE asset_id = ?").get(asset.id);
        const subjects = projection ? JSON.parse(projection.subjects_json) : [];
        console.log('Gemini subjects:');
        for (const s of subjects) {
            console.log(`  - label: ${s.label}, x: ${s.bounding_box.x}, y: ${s.bounding_box.y}, w: ${s.bounding_box.width}, h: ${s.bounding_box.height} (center X: ${(s.bounding_box.x + s.bounding_box.width/2).toFixed(3)}, center Y: ${(s.bounding_box.y + s.bounding_box.height/2).toFixed(3)})`);
        }
    }
}

db.close();
