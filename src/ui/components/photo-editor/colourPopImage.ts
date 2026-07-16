export type ColourPopImage = {
    data: Uint8ClampedArray;
    height: number;
    width: number;
};

function scaledDimensions(width: number, height: number, maximumEdge: number): { height: number; width: number } {
    const scale = Math.min(1, maximumEdge / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function loadColourPopImage(url: string, maximumEdge: number): Promise<ColourPopImage> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            try {
                const size = scaledDimensions(image.naturalWidth, image.naturalHeight, maximumEdge);
                const canvas = document.createElement('canvas');
                canvas.width = size.width;
                canvas.height = size.height;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                if (!context) {throw new Error('Canvas is unavailable');}
                context.drawImage(image, 0, 0, size.width, size.height);
                resolve({ ...size, data: context.getImageData(0, 0, size.width, size.height).data });
            } catch (error) {
                reject(error);
            }
        };
        image.onerror = () => reject(new Error('Unable to read image colours'));
        image.src = url;
    });
}
