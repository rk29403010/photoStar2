/**
 * InfoPanel.tsx
 * Modeless left-side panel showing all information about the current asset.
 * Tabs: File | Analysis | People | JSON
 * Auto-updates when asset changes (parent controls which asset via prop).
 */
import React, { useState, useEffect } from 'react';
import type { Asset, FaceBox } from '../../../shared/types/core';

// ── Tab type (declared early — used in InfoPanelProps) ────────────────────
type TabId = 'file' | 'analysis' | 'people' | 'json';

interface InfoPanelProps {
    asset: Asset;
    /** Width of the panel in px */
    width?: number;
    /** Controlled active tab (lifts state to parent for cross-panel sync) */
    activeTab?: TabId;
    onTabChange?: (tab: TabId) => void;
    /** Key of currently hovered face/subject — 'face-{i}' | 'subject-{i}' */
    hoveredFaceKey?: string | null;
    onHoverFaceKey?: (key: string | null) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Render N filled stars + remainder empty, with tooltip showing exact value */
const StarRating: React.FC<{ value: number; label: string }> = ({ value, label }) => {
    const stars = Math.round((value / 100) * 5);
    const pct = Math.round(value);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 60 }}>{label}</span>
            <span title={`${pct}%`} style={{ cursor: 'help', letterSpacing: 1 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} style={{ color: i < stars ? '#f59e0b' : '#374151', fontSize: 14 }}>
                        {i < stars ? '★' : '☆'}
                    </span>
                ))}
            </span>
            <span style={{ fontSize: 10, color: '#64748b' }}>{pct}%</span>
        </div>
    );
};

/** Field row: label + value */
const Field: React.FC<{ label: string; value?: string | null; mono?: boolean; dim?: boolean }> = ({
    label, value, mono, dim
}) => {
    if (value == null || value === '' || value === 'Unknown') return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', paddingBottom: 6 }}>
            <span style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', minWidth: 90, flexShrink: 0 }}>{label}</span>
            <span style={{ fontSize: 12, color: '#374151', fontStyle: 'italic' }}>—</span>
        </div>
    );
    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', paddingBottom: 6 }}>
            <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', minWidth: 90, flexShrink: 0 }}>{label}</span>
            <span style={{
                fontSize: 12, color: dim ? '#64748b' : '#e2e8f0', lineHeight: 1.5,
                fontFamily: mono ? '"Cascadia Code","Consolas",monospace' : undefined,
                wordBreak: 'break-word'
            }}>{value}</span>
        </div>
    );
};

/** Section header */
const Section: React.FC<{ emoji: string; title: string; children: React.ReactNode }> = ({ emoji, title, children }) => (
    <div style={{ marginBottom: 20 }}>
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            borderBottom: '1px solid #1e293b', paddingBottom: 6, marginBottom: 10
        }}>
            <span style={{ fontSize: 14 }}>{emoji}</span>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: 1 }}>{title}</span>
        </div>
        {children}
    </div>
);

/** Chip tag */
const Tag: React.FC<{ text: string; color?: string }> = ({ text, color = '#3b4a6b' }) => (
    <span style={{
        background: color, borderRadius: 4, padding: '2px 7px', fontSize: 11,
        color: '#cbd5e1', display: 'inline-block', margin: '2px 2px 2px 0'
    }}>{text}</span>
);

/** Format a path to show only the filename + parent folder */
function shortPath(path: string) {
    const parts = path.split(/[/\\]/);
    return parts.length >= 2 ? `…/${parts[parts.length - 2]}/${parts[parts.length - 1]}` : path;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS: Array<{ id: TabId; emoji: string; label: string }> = [
    { id: 'file', emoji: '📁', label: 'File' },
    { id: 'analysis', emoji: '🧠', label: 'Analysis' },
    { id: 'people', emoji: '👥', label: 'People' },
    { id: 'json', emoji: '{ }', label: 'Raw' },
];

// ── File Tab ──────────────────────────────────────────────────────────────────

const FileTab: React.FC<{ asset: Asset }> = ({ asset }) => {
    const filename = asset.original_path.split(/[/\\]/).pop() || '';
    const ext = filename.split('.').pop()?.toUpperCase() || '';
    const ai = asset.ai_metadata as Record<string, unknown> | undefined;

    return (
        <div>
            <Section emoji="📄" title="File">
                <Field label="Name" value={filename} />
                <Field label="Path" value={shortPath(asset.original_path)} mono dim />
                <Field label="Format" value={ext} />
                {asset.width && asset.height && (
                    <Field label="Dimensions" value={`${asset.width} × ${asset.height} px`} />
                )}
                {asset.created_at && (
                    <Field label="Imported" value={new Date(asset.created_at).toLocaleString()} />
                )}
            </Section>

            {ai && (
                <Section emoji="🤖" title="AI Interpretation">
                    <Field label="Type" value={ai.type as string} />
                    <Field label="Est. Date" value={ai.estimated_date as string} />
                    <Field label="Location" value={ai.location as string} />
                    <Field label="Model" value={asset.ai_metadata?._analysis_tier === 'pro' ? '✨ Pro (3.1)' : asset.ai_metadata?._analysis_tier === 'flash' ? '⚡ Flash (3)' : undefined} />
                    {Boolean(asset.ai_metadata?._pending_pro) && (
                        <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 6, padding: '6px 10px', marginTop: 4 }}>
                            <span style={{ fontSize: 11, color: '#fbbf24' }}>⏳ Queued for enhanced pro analysis</span>
                        </div>
                    )}
                </Section>
            )}

            {Boolean(ai?.caption) && (
                <Section emoji="💬" title="Caption">
                    <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', lineHeight: 1.7, fontStyle: 'italic' }}>
                        &ldquo;{String(ai!.caption)}&rdquo;
                    </p>
                </Section>
            )}

            {Array.isArray(ai?.keywords) && (ai.keywords as string[]).length > 0 && (
                <Section emoji="🏷️" title="Keywords">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(ai.keywords as string[]).map((k, i) => <Tag key={i} text={k} />)}
                    </div>
                </Section>
            )}

            {Boolean(ai?.emotional_impact) && (
                <Section emoji="💖" title="Emotional Impact">
                    <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
                        {String(ai!.emotional_impact)}
                    </p>
                </Section>
            )}
        </div>
    );
};

// ── Analysis Tab ─────────────────────────────────────────────────────────────

const AnalysisTab: React.FC<{ asset: Asset }> = ({ asset }) => {
    const ai = asset.ai_metadata as Record<string, unknown> | undefined;
    const quality = ai?.quality as Record<string, unknown> | undefined;
    const auth = ai?.authenticity as Record<string, unknown> | undefined;

    const sensiColor = (s: number | undefined) =>
        s == null ? '#4b5563'
            : s >= 75 ? '#ef4444'
                : s >= 25 ? '#f59e0b'
                    : '#22c55e';

    return (
        <div>
            {/* Quality Stars */}
            {quality && (
                <Section emoji="⭐" title="Quality Scores">
                    {quality.technical != null && <StarRating value={quality.technical as number} label="Technical" />}
                    {quality.lighting != null && <StarRating value={quality.lighting as number} label="Lighting" />}
                    {quality.composition != null && <StarRating value={quality.composition as number} label="Composition" />}
                    {quality.emotional != null && <StarRating value={quality.emotional as number} label="Emotional" />}
                    {quality.discard === true && (
                        <div style={{
                            marginTop: 8, background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6,
                            padding: '6px 10px', fontSize: 12, color: '#fca5a5'
                        }}>
                            🗑️ Suggested for discard
                        </div>
                    )}
                </Section>
            )}

            {/* Authenticity */}
            {auth && (
                <Section emoji="🔎" title="Authenticity">
                    {auth.score != null && <StarRating value={auth.score as number} label="Score" />}
                    {Array.isArray(auth.reasons) && auth.reasons.length > 0 && (
                        <ul style={{ margin: '8px 0 0', padding: '0 0 0 16px', fontSize: 12, color: '#94a3b8', lineHeight: 1.8 }}>
                            {(auth.reasons as string[]).map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                    )}
                </Section>
            )}

            {/* Sensitivity */}
            <Section emoji="🛡️" title="Sensitivity">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {asset.sensitivity_score != null ? (
                        <>
                            <span style={{
                                fontSize: 22, fontWeight: 700, color: sensiColor(asset.sensitivity_score)
                            }}>{Math.round(asset.sensitivity_score)}%</span>
                            <div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>AI sensitivity score</div>
                                {asset.sensitivity_status && (
                                    <span style={{
                                        fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                                        color: asset.sensitivity_status === 'safe' ? '#4ade80'
                                            : asset.sensitivity_status === 'unsafe' ? '#ef4444' : '#f59e0b'
                                    }}>Manual: {asset.sensitivity_status}</span>
                                )}
                            </div>
                        </>
                    ) : (
                        <span style={{ fontSize: 12, color: '#374151', fontStyle: 'italic' }}>Not yet scored</span>
                    )}
                </div>
            </Section>

            {/* Recommended Enhancements */}
            {Array.isArray(ai?.recommended_enhancements) && (ai.recommended_enhancements as string[]).length > 0 && (
                <Section emoji="✨" title="Recommended Enhancements">
                    <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: '#94a3b8', lineHeight: 1.9 }}>
                        {(ai.recommended_enhancements as string[]).map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                </Section>
            )}

            {!ai && !asset.sensitivity_score && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#374151' }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🤔</div>
                    <div style={{ fontSize: 13 }}>No analysis yet</div>
                    <div style={{ fontSize: 11, color: '#1e293b', marginTop: 4 }}>Use Actions → Analyze Image</div>
                </div>
            )}
        </div>
    );
};

// ── People Tab ────────────────────────────────────────────────────────────────

interface PeopleTabProps {
    asset: Asset;
    hoveredFaceKey?: string | null;
    onHoverFaceKey?: (key: string | null) => void;
}

const PeopleTab: React.FC<PeopleTabProps> = ({ asset, hoveredFaceKey, onHoverFaceKey }) => {
    const ai = asset.ai_metadata as Record<string, unknown> | undefined;
    const subjects = (ai?.subjects as Array<Record<string, unknown>> | undefined) || [];
    const faces = (asset.faces || []) as FaceBox[];
    const namedFaces = faces.filter(f => f.person_name);

    const hasAnyData = subjects.length > 0 || namedFaces.length > 0 || faces.length > 0;

    if (!hasAnyData) {
        return (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#374151' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>👤</div>
                <div style={{ fontSize: 13 }}>No people data yet</div>
                <div style={{ fontSize: 11, color: '#1e293b', marginTop: 4 }}>
                    Run face detection and AI analysis to identify people
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Recognised Faces (from face detection + clustering) */}
            {namedFaces.length > 0 && (
                <Section emoji="🔍" title="Recognised People">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {namedFaces.map((f, i) => {
                            // Find the real index in the full faces array
                            const faceIdx = faces.indexOf(f);
                            const key = `face-${faceIdx}`;
                            const isHovered = hoveredFaceKey === key;
                            return (
                                <div
                                    key={i}
                                    onMouseEnter={() => onHoverFaceKey?.(key)}
                                    onMouseLeave={() => onHoverFaceKey?.(null)}
                                    style={{
                                        background: isHovered
                                            ? 'rgba(34,197,94,0.2)'
                                            : 'rgba(34,197,94,0.08)',
                                        border: isHovered
                                            ? '1px solid rgba(34,197,94,0.7)'
                                            : '1px solid rgba(34,197,94,0.2)',
                                        borderRadius: 8,
                                        padding: '8px 12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        cursor: 'default',
                                        transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
                                        boxShadow: isHovered ? '0 0 0 1px rgba(34,197,94,0.4), 0 0 8px rgba(34,197,94,0.2)' : 'none',
                                    }}
                                >
                                    <span style={{ fontSize: 18 }}>🙂</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, color: '#4ade80', fontWeight: 600 }}>{f.person_name}</div>
                                        <div style={{ fontSize: 10, color: '#64748b' }}>Face #{faceIdx + 1} — matched by face recognition</div>
                                    </div>
                                    {isHovered && (
                                        <span style={{ fontSize: 10, color: '#22c55e', opacity: 0.7 }}>📍 on image</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </Section>
            )}

            {/* All detected faces (including unknown) */}
            {faces.length > 0 && (
                <Section emoji="👤" title="Detected Faces">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {faces.map((f, i) => {
                            const key = `face-${i}`;
                            const isHovered = hoveredFaceKey === key;
                            const isNamed = !!f.person_name;
                            return (
                                <div
                                    key={i}
                                    onMouseEnter={() => onHoverFaceKey?.(key)}
                                    onMouseLeave={() => onHoverFaceKey?.(null)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '5px 10px',
                                        borderRadius: 6,
                                        background: isHovered
                                            ? (isNamed ? 'rgba(34,197,94,0.12)' : 'rgba(56,189,248,0.12)')
                                            : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${isHovered
                                            ? (isNamed ? 'rgba(34,197,94,0.5)' : 'rgba(56,189,248,0.5)')
                                            : 'rgba(255,255,255,0.05)'}`,
                                        cursor: 'default',
                                        transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
                                        boxShadow: isHovered ? `0 0 8px ${isNamed ? 'rgba(34,197,94,0.2)' : 'rgba(56,189,248,0.2)'}` : 'none',
                                    }}
                                >
                                    <span style={{
                                        width: 22, height: 22, borderRadius: '50%',
                                        background: isNamed ? 'rgba(34,197,94,0.2)' : 'rgba(56,189,248,0.15)',
                                        border: `1px solid ${isNamed ? 'rgba(34,197,94,0.4)' : 'rgba(56,189,248,0.3)'}`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 11, flexShrink: 0
                                    }}>#{i + 1}</span>
                                    <div style={{ flex: 1 }}>
                                        <span style={{ fontSize: 12, color: isNamed ? '#4ade80' : '#94a3b8' }}>
                                            {f.person_name || 'Unknown'}
                                        </span>
                                    </div>
                                    {isHovered && (
                                        <span style={{ fontSize: 10, color: '#64748b', opacity: 0.7 }}>📍</span>
                                    )}
                                </div>
                            );
                        })}
                        <div style={{ fontSize: 11, color: '#475569', marginTop: 2, paddingLeft: 4 }}>
                            {namedFaces.length} recognised · {faces.length - namedFaces.length} unknown
                        </div>
                    </div>
                </Section>
            )}

            {/* AI-identified subjects */}
            {subjects.length > 0 && (
                <Section emoji="🤖" title="AI Subjects">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {subjects.map((s, i) => {
                            const key = `subject-${i}`;
                            const isHovered = hoveredFaceKey === key;
                            const names = s.suggested_names as string[] | undefined;
                            const hasBbox = !!(s.bounding_box as Record<string, number> | undefined);
                            return (
                                <div
                                    key={i}
                                    onMouseEnter={() => onHoverFaceKey?.(key)}
                                    onMouseLeave={() => onHoverFaceKey?.(null)}
                                    style={{
                                        background: isHovered
                                            ? 'rgba(99,102,241,0.15)'
                                            : 'rgba(99,102,241,0.07)',
                                        border: isHovered
                                            ? '1px solid rgba(99,102,241,0.6)'
                                            : '1px solid rgba(99,102,241,0.2)',
                                        borderRadius: 8,
                                        padding: '10px 12px',
                                        cursor: 'default',
                                        transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
                                        boxShadow: isHovered ? '0 0 0 1px rgba(99,102,241,0.4), 0 0 10px rgba(99,102,241,0.25)' : 'none',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                        <span style={{ fontSize: 16 }}>{s.type === 'pet' ? '🐾' : '🧑'}</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: isHovered ? '#c4b5fd' : '#a5b4fc' }}>
                                            {(s.label as string) || `Subject ${i + 1}`}
                                        </span>
                                        {names && names.length > 0 && (
                                            <span style={{
                                                fontSize: 11, background: 'rgba(168,85,247,0.2)',
                                                color: '#c084fc', padding: '1px 6px', borderRadius: 4, marginLeft: 4
                                            }}>
                                                {names.join(' / ')}
                                            </span>
                                        )}
                                        <div style={{ flex: 1 }} />
                                        {hasBbox && (
                                            <span style={{
                                                fontSize: 10,
                                                color: isHovered ? '#a5b4fc' : '#475569',
                                                opacity: isHovered ? 1 : 0.6,
                                                transition: 'color 0.15s'
                                            }}>📍 {isHovered ? 'on image' : 'has box'}</span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {Boolean(s.location_desc) && <Tag text={`📍 ${String(s.location_desc)}`} color="rgba(30,64,175,0.4)" />}
                                        {Boolean(s.gender) && <Tag text={String(s.gender)} color="rgba(99,102,241,0.3)" />}
                                        {Boolean(s.age_range) && <Tag text={`~${String(s.age_range)}`} color="rgba(20,83,45,0.5)" />}
                                        {Boolean(s.emotion) && <Tag text={String(s.emotion)} color="rgba(146,64,14,0.5)" />}
                                        {Boolean(s.uniform) && <Tag text={`🎽 ${String(s.uniform)}`} color="rgba(91,33,182,0.4)" />}
                                        {Boolean(s.animal_type) && <Tag text={`🐾 ${String(s.animal_type)}`} color="rgba(21,94,117,0.5)" />}
                                    </div>
                                    {Boolean(s.features) && (
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                                            {String(s.features)}
                                        </div>
                                    )}
                                    {Boolean(s.dob_range) && (
                                        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                                            Est. born: {String(s.dob_range)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </Section>
            )}
        </div>
    );
};

// ── JSON Tab ──────────────────────────────────────────────────────────────────

// Colour palette for JSON values
const J = {
    key: '#93c5fd', // blue-300  — object keys
    str: '#86efac', // green-300 — string values
    num: '#fcd34d', // amber-300 — numbers
    bool: '#67e8f9', // cyan-300  — booleans
    nil: '#f87171', // red-400   — null
    brace: '#94a3b8', // slate-400 — brackets / punctuation
    index: '#475569', // slate-600 — array indices
} as const;

// Use unknown for JSON values — TypeScript can't express recursive union types without interfaces
// All narrowing is done at runtime inside JsonNode.
type JsonValue = unknown;

interface JsonNodeProps {
    value: JsonValue;
    keyName?: string;
    depth: number;
    isLast: boolean;
    wordWrap: boolean;
    /** depth === 0 → top-level keys start expanded, depth > 0 → start collapsed */
    defaultOpen: boolean;
}

const JsonNode: React.FC<JsonNodeProps> = ({ value, keyName, depth, isLast, wordWrap, defaultOpen }) => {
    const [open, setOpen] = useState(defaultOpen);

    const isObject = value !== null && typeof value === 'object';
    const isArray = Array.isArray(value);
    const entries: [string, unknown][] = isObject
        ? isArray
            ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
            : Object.entries(value as Record<string, unknown>)
        : [];
    const childCount = entries.length;

    const comma = isLast ? '' : ',';
    const indent = depth * 14; // px per level

    // Key label
    const keyLabel = keyName !== undefined ? (
        isArray && /^\d+$/.test(keyName)
            ? <span style={{ color: J.index }}>[{keyName}]&nbsp;</span>
            : <><span style={{ color: J.key }}>"{keyName}"</span><span style={{ color: J.brace }}>:&nbsp;</span></>
    ) : null;

    // Leaf rendering
    if (!isObject) {
        let valueEl: React.ReactNode;
        if (typeof value === 'string') {
            valueEl = <span style={{ color: J.str, wordBreak: wordWrap ? 'break-all' : 'normal', whiteSpace: wordWrap ? 'pre-wrap' : 'nowrap' }}>"{value}"</span>;
        } else if (typeof value === 'number') {
            valueEl = <span style={{ color: J.num }}>{value}</span>;
        } else if (typeof value === 'boolean') {
            valueEl = <span style={{ color: J.bool }}>{String(value)}</span>;
        } else {
            valueEl = <span style={{ color: J.nil }}>null</span>;
        }
        return (
            <div style={{ paddingLeft: indent, lineHeight: '1.7', display: 'flex', gap: 2, flexWrap: 'nowrap', minWidth: 0 }}>
                {keyLabel}{valueEl}<span style={{ color: J.brace }}>{comma}</span>
            </div>
        );
    }

    // Collapsed one-liner summary
    const summary = isArray
        ? <span style={{ color: J.brace }}>[<span style={{ color: J.index, fontSize: 9 }}> {childCount} </span>]</span>
        : <span style={{ color: J.brace }}>{'{'}…{'}'}</span>;

    return (
        <div style={{ paddingLeft: depth === 0 ? 0 : indent }}>
            {/* Header row — clickable to expand/collapse */}
            <div
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                    borderRadius: 3, padding: '1px 2px', lineHeight: '1.7',
                    userSelect: 'none',
                }}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            >
                {/* Chevron */}
                <span style={{
                    fontSize: 9, color: '#475569', display: 'inline-block',
                    transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.12s', width: 10, flexShrink: 0,
                }}>▶</span>

                {keyLabel}
                {!open && <>{summary}<span style={{ color: J.brace }}>{comma}</span></>}
                {open && <span style={{ color: J.brace }}>{isArray ? '[' : '{'}</span>}
            </div>

            {/* Children */}
            {open && (
                <div style={{ paddingLeft: 14, borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
                    {entries.map(([k, v], i) => (
                        <JsonNode
                            key={k}
                            keyName={k}
                            value={v}
                            depth={0}       // children manage their own indentation
                            isLast={i === entries.length - 1}
                            wordWrap={wordWrap}
                            defaultOpen={false}  // children always start collapsed
                        />
                    ))}
                </div>
            )}

            {/* Closing bracket */}
            {open && (
                <div style={{ lineHeight: '1.7' }}>
                    <span style={{ color: J.brace }}>{isArray ? ']' : '}'}{comma}</span>
                </div>
            )}
        </div>
    );
};

const JsonTab: React.FC<{ asset: Asset }> = ({ asset }) => {
    const [wordWrap, setWordWrap] = useState(false);

    // Serialise first — JSON.parse removes undefined fields and resolves the type cleanly
    const jsonStr = JSON.stringify({
        ...asset,
        faces: asset.faces?.map(f => ({ ...f, embedding: undefined })),
        face_embeddings: undefined,
    }, null, 2);
    const sanitised = JSON.parse(jsonStr) as Record<string, unknown>;
    const handleCopy = async () => {
        try { await navigator.clipboard.writeText(jsonStr); } catch { /* ignore */ }
    };

    return (
        <div>
            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 8 }}>
                <button
                    onClick={() => setWordWrap(w => !w)}
                    title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
                    style={{
                        background: wordWrap ? 'rgba(99,102,241,0.25)' : 'rgba(51,65,85,0.8)',
                        border: `1px solid ${wordWrap ? '#6366f1' : '#334155'}`,
                        color: wordWrap ? '#a5b4fc' : '#94a3b8',
                        padding: '4px 8px', borderRadius: 4,
                        cursor: 'pointer', fontSize: 14, lineHeight: 1,
                        transition: 'all 0.15s',
                    }}
                >↵</button>
                <button
                    onClick={handleCopy}
                    style={{
                        background: 'rgba(51,65,85,0.8)', border: '1px solid #334155',
                        color: '#94a3b8', padding: '4px 10px', borderRadius: 4,
                        cursor: 'pointer', fontSize: 11,
                    }}
                >📋 Copy JSON</button>
            </div>

            {/* Interactive tree */}
            <div style={{
                fontFamily: '"Cascadia Code","Consolas",monospace',
                fontSize: 11, background: 'rgba(0,0,0,0.4)',
                border: '1px solid #1e293b', borderRadius: 6,
                padding: '10px 12px', overflowY: 'auto', overflowX: wordWrap ? 'hidden' : 'auto',
                maxHeight: 'calc(100vh - 240px)',
                lineHeight: 1.6,
            }}>
                {/* Render each top-level key as its own node, expanded by default */}
                {Object.entries(sanitised).map(([k, v], i, arr) => (
                    <JsonNode
                        key={k}
                        keyName={k}
                        value={v as JsonValue}
                        depth={0}
                        isLast={i === arr.length - 1}
                        wordWrap={wordWrap}
                        defaultOpen={true}
                    />
                ))}
            </div>
        </div>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const InfoPanel: React.FC<InfoPanelProps> = ({
    asset, width = 360,
    activeTab: controlledTab,
    onTabChange,
    hoveredFaceKey,
    onHoverFaceKey,
}) => {
    const [internalTab, setInternalTab] = useState<TabId>('file');
    const activeTab = controlledTab ?? internalTab;
    const setActiveTab = (t: TabId) => { setInternalTab(t); onTabChange?.(t); };

    // Switch to Analysis tab automatically when AI metadata arrives
    useEffect(() => {
        if (asset.ai_metadata && activeTab === 'file') setActiveTab('analysis');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [asset.id]);

    const filename = asset.original_path.split(/[/\\]/).pop() || '';

    // Determine which tabs have content (for badge indicators)
    const hasAI = !!asset.ai_metadata;
    const hasPeople = !!(asset.faces?.length || (asset.ai_metadata as Record<string, unknown> | undefined)?.subjects);

    return (
        <div
            style={{
                width, minWidth: width, maxWidth: width,
                height: '100%',
                background: 'linear-gradient(180deg, #0f172a 0%, #0a0f1e 100%)',
                borderRight: '1px solid #1e293b',
                display: 'flex', flexDirection: 'column',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                overflow: 'hidden',
                flexShrink: 0
            }}
        >
            {/* Header */}
            <div style={{
                padding: '14px 16px 10px',
                borderBottom: '1px solid #1e293b',
                background: 'rgba(15,23,42,0.9)',
                flexShrink: 0
            }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 2, wordBreak: 'break-all' }}>
                    📷 {filename}
                </div>
                <div style={{ fontSize: 10, color: '#475569' }}>
                    {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ''}
                    {hasAI ? '🧠 Analysed' : '⏳ Not yet analysed'}
                </div>
            </div>

            {/* Tab Bar */}
            <div style={{
                display: 'flex',
                borderBottom: '1px solid #1e293b',
                background: '#080d1a',
                flexShrink: 0
            }}>
                {TABS.map(tab => {
                    const hasBadge = (tab.id === 'analysis' && hasAI) || (tab.id === 'people' && hasPeople);
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                flex: 1, padding: '10px 4px 8px',
                                background: 'transparent', border: 'none',
                                borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent',
                                cursor: 'pointer', transition: 'all 0.15s',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                position: 'relative'
                            }}
                        >
                            <span style={{ fontSize: tab.id === 'json' ? 10 : 14 }}>{tab.emoji}</span>
                            <span style={{
                                fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5,
                                color: isActive ? '#818cf8' : '#475569',
                                fontWeight: isActive ? 700 : 400
                            }}>{tab.label}</span>
                            {hasBadge && !isActive && (
                                <span style={{
                                    position: 'absolute', top: 4, right: 6,
                                    width: 6, height: 6, borderRadius: '50%',
                                    background: '#6366f1'
                                }} />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 20px' }}>
                {activeTab === 'file' && <FileTab asset={asset} />}
                {activeTab === 'analysis' && <AnalysisTab asset={asset} />}
                {activeTab === 'people' && (
                    <PeopleTab
                        asset={asset}
                        hoveredFaceKey={hoveredFaceKey}
                        onHoverFaceKey={onHoverFaceKey}
                    />
                )}
                {activeTab === 'json' && <JsonTab asset={asset} />}
            </div>
        </div>
    );
};
