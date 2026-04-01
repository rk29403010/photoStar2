import type { MetadataProfile, SignalWindow } from './photoDateEstimateShared';

const UNKNOWN_EMBEDDED_WEIGHT_FACTOR = 0.75;
const WIDE_DIVERGENCE_YEARS = 20;
const BORN_DIGITAL_CAPTURE_WEIGHT_FACTOR = 0.2;
const BORN_DIGITAL_EMBEDDED_WEIGHT_FACTOR = 0.2;
const BORN_DIGITAL_AI_WEIGHT_FACTOR = 1.4;

function scaleSignal(signal: SignalWindow, factor: number): SignalWindow {
    return {
        ...signal,
        weight: Number((signal.weight * factor).toFixed(3)),
    };
}

function isCaptureTimestampSource(source: string): boolean {
    const normalizedSource = source.toLowerCase();
    return normalizedSource.endsWith('datetimeoriginal')
        || normalizedSource.endsWith('createdate')
        || normalizedSource.endsWith('datetimedigitized');
}

function isEmbeddedCaptureSignal(signal: SignalWindow): boolean {
    return signal.origin === 'embedded' && isCaptureTimestampSource(signal.source);
}

function isEmbeddedSignal(signal: SignalWindow): boolean {
    return signal.origin === 'embedded';
}

function isAiSignal(signal: SignalWindow): boolean {
    return signal.origin === 'ai';
}

function getYearDistance(leftMs: number, rightMs: number): number {
    return Math.abs(new Date(leftMs).getUTCFullYear() - new Date(rightMs).getUTCFullYear());
}

function hasWideAiCaptureDivergence(signals: SignalWindow[]): boolean {
    const aiSignals = signals.filter(isAiSignal);
    const captureSignals = signals.filter((signal) => signal.origin === 'file' || isEmbeddedCaptureSignal(signal));
    return aiSignals.some((aiSignal) => (
        captureSignals.some((captureSignal) => (
            getYearDistance(aiSignal.representativeMs, captureSignal.representativeMs) >= WIDE_DIVERGENCE_YEARS
        ))
    ));
}

function rebalanceUnknownSignals(signals: SignalWindow[]): SignalWindow[] {
    return signals.map((signal) => (
        signal.origin === 'embedded'
            ? scaleSignal(signal, UNKNOWN_EMBEDDED_WEIGHT_FACTOR)
            : signal
    ));
}

function rebalanceBornDigitalSignals(signals: SignalWindow[]): SignalWindow[] {
    if (!hasWideAiCaptureDivergence(signals)) {
        return signals;
    }

    return signals.map((signal) => {
        if (signal.origin === 'ai') {
            return scaleSignal(signal, BORN_DIGITAL_AI_WEIGHT_FACTOR);
        }
        if (signal.origin === 'file') {
            return scaleSignal(signal, BORN_DIGITAL_CAPTURE_WEIGHT_FACTOR);
        }
        if (isEmbeddedSignal(signal)) {
            return scaleSignal(signal, BORN_DIGITAL_EMBEDDED_WEIGHT_FACTOR);
        }
        return signal;
    });
}

export function rebalanceSignalsForMetadataProfile(params: {
    metadataProfile: MetadataProfile;
    signals: SignalWindow[];
}): SignalWindow[] {
    if (params.metadataProfile === 'unknown') {
        return rebalanceUnknownSignals(params.signals);
    }
    if (params.metadataProfile === 'born_digital') {
        return rebalanceBornDigitalSignals(params.signals);
    }

    return params.signals;
}
