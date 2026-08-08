function assertPowerOfTwo(value: number, name: string): void {
    if (!Number.isInteger(value) || value < 1 || (value & (value - 1)) !== 0) {
        throw new Error(`${name} must be a positive power of two`);
    }
}

function swap(values: Float32Array, left: number, right: number): void {
    const temporary = values[left];
    values[left] = values[right];
    values[right] = temporary;
}

function bitReverse(real: Float32Array, imaginary: Float32Array, offset: number, stride: number, length: number): void {
    for (let index = 1, reversed = 0; index < length; index += 1) {
        let bit = length >> 1;
        while ((reversed & bit) !== 0) {
            reversed ^= bit;
            bit >>= 1;
        }
        reversed ^= bit;
        if (index < reversed) {
            swap(real, offset + index * stride, offset + reversed * stride);
            swap(imaginary, offset + index * stride, offset + reversed * stride);
        }
    }
}

function butterflies(
    real: Float32Array,
    imaginary: Float32Array,
    offset: number,
    stride: number,
    length: number,
    inverse: boolean,
): void {
    const direction = inverse ? 1 : -1;
    for (let blockSize = 2; blockSize <= length; blockSize <<= 1) {
        const angle = direction * 2 * Math.PI / blockSize;
        const stepReal = Math.cos(angle);
        const stepImaginary = Math.sin(angle);
        const half = blockSize >> 1;
        for (let block = 0; block < length; block += blockSize) {
            butterflyBlock(real, imaginary, offset, stride, block, half, stepReal, stepImaginary);
        }
    }
}

function butterflyBlock(
    real: Float32Array,
    imaginary: Float32Array,
    offset: number,
    stride: number,
    block: number,
    half: number,
    stepReal: number,
    stepImaginary: number,
): void {
    let twiddleReal = 1;
    let twiddleImaginary = 0;
    for (let item = 0; item < half; item += 1) {
        const upper = offset + (block + item) * stride;
        const lower = offset + (block + item + half) * stride;
        const lowerReal = real[lower] * twiddleReal - imaginary[lower] * twiddleImaginary;
        const lowerImaginary = real[lower] * twiddleImaginary + imaginary[lower] * twiddleReal;
        const upperReal = real[upper];
        const upperImaginary = imaginary[upper];
        real[upper] = upperReal + lowerReal;
        imaginary[upper] = upperImaginary + lowerImaginary;
        real[lower] = upperReal - lowerReal;
        imaginary[lower] = upperImaginary - lowerImaginary;
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
    }
}

function normalise(values: Float32Array, offset: number, stride: number, length: number): void {
    for (let index = 0; index < length; index += 1) {
        values[offset + index * stride] /= length;
    }
}

function fft1d(
    real: Float32Array,
    imaginary: Float32Array,
    offset: number,
    stride: number,
    length: number,
    inverse: boolean,
): void {
    bitReverse(real, imaginary, offset, stride, length);
    butterflies(real, imaginary, offset, stride, length, inverse);
    if (inverse) {
        normalise(real, offset, stride, length);
        normalise(imaginary, offset, stride, length);
    }
}

export function fft2dInPlace(
    real: Float32Array,
    imaginary: Float32Array,
    width: number,
    height: number,
    inverse = false,
): void {
    assertPowerOfTwo(width, 'FFT width');
    assertPowerOfTwo(height, 'FFT height');
    if (real.length !== width * height || imaginary.length !== real.length) {
        throw new Error('FFT buffers do not match the requested dimensions');
    }
    for (let y = 0; y < height; y += 1) {
        fft1d(real, imaginary, y * width, 1, width, inverse);
    }
    for (let x = 0; x < width; x += 1) {
        fft1d(real, imaginary, x, width, height, inverse);
    }
}

export function nextPowerOfTwo(value: number): number {
    if (!Number.isFinite(value) || value < 1) {
        throw new Error('value must be positive');
    }
    let result = 1;
    while (result < value) {
        result *= 2;
    }
    return result;
}
