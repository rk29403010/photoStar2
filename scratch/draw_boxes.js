import sharp from 'sharp';
import fs from 'node:fs/promises';

const imagePath = 'C:\\Users\\robin\\Pictures\\Family History\\Family History - Croot-Sheldrake\\221421-082918_05.jpg';

// Gemini Projection coordinates from DB:
const geminiBoxes = [
  // Subjects
  { label: 'Subject1', x: 0.199, y: 0.07, w: 0.128, h: 0.094, color: 'purple' },
  { label: 'Subject2', x: 0.385, y: 0.07, w: 0.128, h: 0.094, color: 'purple' },
  // ROIs
  { label: 'Stone wall', x: 0, y: 0.48, w: 1, h: 0.32, color: 'orange' },
  { label: 'Cloche Hat 1', x: 0.19, y: 0, w: 0.18, h: 0.15, color: 'orange' },
  { label: 'Cloche Hat 2', x: 0.39, y: 0, w: 0.18, h: 0.15, color: 'orange' },
  { label: 'Dress 1', x: 0.15, y: 0.25, w: 0.3, h: 0.45, color: 'orange' },
  { label: 'Dress 2', x: 0.38, y: 0.25, w: 0.3, h: 0.45, color: 'orange' }
];

// Local face detection:
const localFaces = [
  { label: 'Face 1', x: 0.15, y: 0.21, w: 0.06, h: 0.08, color: 'blue' }, // approximate from visual
  { label: 'Face 2', x: 0.24, y: 0.22, w: 0.05, h: 0.08, color: 'blue' }
];

async function run() {
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const width = metadata.width;
    const height = metadata.height;

    // Create SVG overlay containing the boxes
    let svg = `<svg width="${width}" height="${height}">`;
    
    // Draw all boxes
    const allBoxes = [...geminiBoxes, ...localFaces];
    for (const box of allBoxes) {
        const xPx = box.x * width;
        const yPx = box.y * height;
        const wPx = box.w * width;
        const hPx = box.h * height;
        
        let strokeColor = 'orange';
        let strokeDash = '';
        if (box.color === 'purple') {
            strokeColor = 'purple';
            strokeDash = 'stroke-dasharray="10,5"';
        } else if (box.color === 'blue') {
            strokeColor = 'cyan';
        }
        
        svg += `
          <rect x="${xPx}" y="${yPx}" width="${wPx}" height="${hPx}" 
            fill="none" stroke="${strokeColor}" stroke-width="10" ${strokeDash} />
          <text x="${xPx + 15}" y="${yPx + 50}" fill="${strokeColor}" font-size="40" font-family="sans-serif" font-weight="bold">${box.label}</text>
        `;
    }
    svg += '</svg>';

    // Composite overlay on the image and save
    const outputBuffer = await image
        .composite([{
            input: Buffer.from(svg),
            top: 0,
            left: 0
        }])
        .toBuffer();

    await fs.writeFile('scratch/drawn_boxes.jpg', outputBuffer);
    console.log('Drawn image saved to scratch/drawn_boxes.jpg');
}

run().catch(console.error);
