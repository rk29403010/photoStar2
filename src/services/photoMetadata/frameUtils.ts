export type FrameDetectionData = {
    type: 'rectangle' | 'polygon';
    box?: { x: number; y: number; width: number; height: number };
    points?: Array<{ x: number; y: number }>;
};

type Box = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

function toPoint(pt: unknown): Point | null {
    if (pt && typeof pt === 'object') {
        const x = (pt as Record<string, unknown>).x;
        const y = (pt as Record<string, unknown>).y;
        if (typeof x === 'number' && typeof y === 'number') {
            return { x, y };
        }
    }
    return null;
}

function parseRectangleBox(box: unknown): Box | null {
    if (!box || typeof box !== 'object') {
        return null;
    }
    const b = box as Record<string, unknown>;
    if (
        typeof b.x === 'number' &&
        typeof b.y === 'number' &&
        typeof b.width === 'number' &&
        typeof b.height === 'number'
    ) {
        return { x: b.x, y: b.y, width: b.width, height: b.height };
    }
    return null;
}

function parsePolygonBox(points: unknown): Box | null {
    if (!Array.isArray(points)) {
        return null;
    }
    const coords: Point[] = [];
    for (const pt of points) {
        const p = toPoint(pt);
        if (p) {
            coords.push(p);
        }
    }

    if (coords.length === 0) {
        return null;
    }

    let minX = coords[0].x;
    let maxX = coords[0].x;
    let minY = coords[0].y;
    let maxY = coords[0].y;

    for (let i = 1; i < coords.length; i++) {
        const p = coords[i];
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    }

    if (maxX > minX && maxY > minY) {
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
        };
    }
    return null;
}

export function getFrameInteriorBox(boundaryData: unknown): Box | null {
    if (!boundaryData || typeof boundaryData !== 'object') {
        return null;
    }
    const data = boundaryData as Record<string, unknown>;
    if (data.type === 'rectangle') {
        return parseRectangleBox(data.box);
    }
    if (data.type === 'polygon') {
        return parsePolygonBox(data.points);
    }
    return null;
}
