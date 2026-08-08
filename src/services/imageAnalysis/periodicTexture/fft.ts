import sharp from 'sharp';

export type ComplexPlanes = { real: Float64Array; imag: Float64Array };

type TransformDirection = 1 | -1;

function reverseBits(value: number, bits: number): number {
    let output = 0;
    for (let bit = 0; bit < bits; bit += 1) {
        output = output * 2 + (value % 2);
        value = Math.floor(value / 2);
    }
    return output;
}

function validatePowerOfTwo(length: number): number {
    const bits = Math.round(Math.log2(length));
    if (2 ** bits !== length) {
        throw new Error(`FFT length ${length} is not a power of two`);
    }
    return bits;
}

function bitReverse(real: Float64Array, imag: Float64Array, bits: number): void {
    for (let index = 0; index < real.length; index += 1) {
        const reversed = reverseBits(index, bits);
        if (reversed <= index) { continue; }
        const realValue = real[index];
        real[index] = real[reversed];
        real[reversed] = realValue;
        const imagValue = imag[index];
        imag[index] = imag[reversed];
        imag[reversed] = imagValue;
    }
}

function butterfly(real: Float64Array, imag: Float64Array, size: number, direction: TransformDirection): void {
    const half = size / 2;
    const angleStep = direction * -2 * Math.PI / size;
    for (let start = 0; start < real.length; start += size) {
        for (let offset = 0; offset < half; offset += 1) {
            const angle = angleStep * offset;
            const cosine = Math.cos(angle);
            const sine = Math.sin(angle);
            const even = start + offset;
            const odd = even + half;
            const oddReal = real[odd] * cosine - imag[odd] * sine;
            const oddImag = real[odd] * sine + imag[odd] * cosine;
            real[odd] = real[even] - oddReal;
            imag[odd] = imag[even] - oddImag;
            real[even] += oddReal;
            imag[even] += oddImag;
        }
    }
}

function fft1dInPlace(real: Float64Array, imag: Float64Array, direction: TransformDirection): void {
    const bits = validatePowerOfTwo(real.length);
    bitReverse(real, imag, bits);
    for (let size = 2; size <= real.length; size *= 2) {
        butterfly(real, imag, size, direction);
    }
    if (direction === -1) {
        for (let index = 0; index < real.length; index += 1) {
            real[index] /= real.length;
            imag[index] /= real.length;
        }
    }
}

function transformRows(planes: ComplexPlanes, width: number, height: number, direction: TransformDirection): void {
    const rowReal = new Float64Array(width);
    const rowImag = new Float64Array(width);
    for (let y = 0; y < height; y += 1) {
        const start = y * width;
        rowReal.set(planes.real.subarray(start, start + width));
        rowImag.set(planes.imag.subarray(start, start + width));
        fft1dInPlace(rowReal, rowImag, direction);
        planes.real.set(rowReal, start);
        planes.imag.set(rowImag, start);
    }
}

function transformColumns(planes: ComplexPlanes, width: number, height: number, direction: TransformDirection): void {
    const columnReal = new Float64Array(height);
    const columnImag = new Float64Array(height);
    for (let x = 0; x < width; x += 1) {
        for (let y = 0; y < height; y += 1) {
            const index = y * width + x;
            columnReal[y] = planes.real[index];
            columnImag[y] = planes.imag[index];
        }
        fft1dInPlace(columnReal, columnImag, direction);
        for (let y = 0; y < height; y += 1) {
            const index = y * width + x;
            planes.real[index] = columnReal[y];
            planes.imag[index] = columnImag[y];
        }
    }
}

export function fft2dInPlace(planes: ComplexPlanes, width: number, height: number, inverse = false): void {
    if (planes.real.length !== width * height || planes.imag.length !== width * height) {
        throw new Error('FFT planes do not match dimensions');
    }
    const direction: TransformDirection = inverse ? -1 : 1;
    transformRows(planes, width, height, direction);
    transformColumns(planes, width, height, direction);
}

export function nextPowerOfTwo(value: number): number {
    return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

export async function gaussianBlurGray(data: Float32Array, width: number, height: number, sigma: number): Promise<Float32Array> {
    const input = Buffer.allocUnsafe(data.length * 4);
    for (let index = 0; index < data.length; index += 1) { input.writeFloatLE(data[index], index * 4); }
    const blurred = await sharp(input, { raw: { width, height, channels: 1 } })
        .blur(Math.max(0.3, sigma))
        .raw()
        .toBuffer();
    const output = new Float32Array(data.length);
    for (let index = 0; index < output.length; index += 1) { output[index] = blurred.readFloatLE(index * 4); }
    return output;
}
