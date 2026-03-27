import type React from 'react';
import type { Asset, FaceBox } from '@contracts/core';
import { Section, Tag } from './shared';
import { buildPhotoMetadataPeopleSummary } from './photoMetadataPanelModel';

interface PeopleTabProps {
  asset: Asset;
  hoveredFaceKey?: string | null;
  onHoverFaceKey?: (key: string | null) => void;
}

const EmptyPeopleState: React.FC = () => (
  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#374151' }}>
    <div style={{ fontSize: 32, marginBottom: 10 }}>👤</div>
    <div style={{ fontSize: 13 }}>No people data yet</div>
    <div style={{ fontSize: 11, color: '#1e293b', marginTop: 4 }}>Run face detection and AI analysis to identify people</div>
  </div>
);

const RecognisedPeopleSection: React.FC<{ faces: FaceBox[]; hoveredFaceKey?: string | null; onHoverFaceKey?: (key: string | null) => void }> = ({ faces, hoveredFaceKey, onHoverFaceKey }) => {
  const namedFaces = faces.filter((face) => face.person_name);
  if (namedFaces.length === 0) {return null;}

  return (
    <Section emoji="🔍" title="Recognised People">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {namedFaces.map((face, i) => {
          const faceIdx = faces.indexOf(face);
          const key = `face-${faceIdx}`;
          const isHovered = hoveredFaceKey === key;

          return (
            <div key={i} onMouseEnter={() => onHoverFaceKey?.(key)} onMouseLeave={() => onHoverFaceKey?.(null)} style={{ background: isHovered ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.08)', border: isHovered ? '1px solid rgba(34,197,94,0.7)' : '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s', boxShadow: isHovered ? '0 0 0 1px rgba(34,197,94,0.4), 0 0 8px rgba(34,197,94,0.2)' : 'none' }}>
              <span style={{ fontSize: 18 }}>🙂</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#4ade80', fontWeight: 600 }}>{face.person_name}</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>Face #{faceIdx + 1} — matched by face recognition</div>
              </div>
              {isHovered && <span style={{ fontSize: 10, color: '#22c55e', opacity: 0.7 }}>📍 on image</span>}
            </div>
          );
        })}
      </div>
    </Section>
  );
};

const DetectedFacesSection: React.FC<{ faces: FaceBox[]; hoveredFaceKey?: string | null; onHoverFaceKey?: (key: string | null) => void }> = ({ faces, hoveredFaceKey, onHoverFaceKey }) => {
  if (faces.length === 0) {return null;}

  return (
    <Section emoji="👤" title="Detected Faces">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {faces.map((face, i) => {
          const key = `face-${i}`;
          const isHovered = hoveredFaceKey === key;
          const isNamed = Boolean(face.person_name);
          return (
            <div key={i} onMouseEnter={() => onHoverFaceKey?.(key)} onMouseLeave={() => onHoverFaceKey?.(null)} style={{ background: isHovered ? 'rgba(56,189,248,0.14)' : 'rgba(56,189,248,0.06)', border: isHovered ? '1px solid rgba(56,189,248,0.55)' : '1px solid rgba(56,189,248,0.18)', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s', boxShadow: isHovered ? '0 0 0 1px rgba(56,189,248,0.35), 0 0 8px rgba(56,189,248,0.2)' : 'none' }}>
              <span style={{ fontSize: 16 }}>{isNamed ? '🙂' : '❓'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: isNamed ? '#67e8f9' : '#94a3b8', fontWeight: 600 }}>{isNamed ? face.person_name : 'Unknown person'}</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>Face #{i + 1}</div>
              </div>
              {face.embedding && <Tag text="embedding" color="rgba(8,145,178,0.35)" />}
            </div>
          );
        })}
      </div>
    </Section>
  );
};

function getSubjectNames(subject: Record<string, unknown>): string[] {
  if (Array.isArray(subject.suggested_names)) {
    return subject.suggested_names as string[];
  }

  return Array.isArray(subject.names) ? subject.names as string[] : [];
}

const SubjectHeader: React.FC<{ subject: Record<string, unknown>; index: number; isHovered: boolean; names: string[]; hasBbox: boolean }> = ({ subject, index, isHovered, names, hasBbox }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
    <span style={{ fontSize: 16 }}>{getSubjectIcon(subject)}</span>
    <span style={{ fontSize: 13, fontWeight: 600, color: isHovered ? '#c4b5fd' : '#a5b4fc' }}>{getSubjectLabel(subject, index)}</span>
    {names.length > 0 && <span style={{ fontSize: 11, background: 'rgba(168,85,247,0.2)', color: '#c084fc', padding: '1px 6px', borderRadius: 4, marginLeft: 4 }}>{names.join(' / ')}</span>}
    <div style={{ flex: 1 }} />
    {hasBbox && <span style={{ fontSize: 10, color: isHovered ? '#a5b4fc' : '#475569', opacity: isHovered ? 1 : 0.6 }}>📍 {getSubjectPinText(isHovered)}</span>}
  </div>
);

const SubjectCard: React.FC<{ subject: Record<string, unknown>; index: number; hoveredFaceKey?: string | null; onHoverFaceKey?: (key: string | null) => void; sourceLabel?: string }> = ({ subject, index, hoveredFaceKey, onHoverFaceKey, sourceLabel }) => {
  const key = `subject-${index}`;
  const isHovered = hoveredFaceKey === key;
  const names = getSubjectNames(subject);
  const hasBbox = Boolean(subject.bounding_box);

  return (
    <div onMouseEnter={() => onHoverFaceKey?.(key)} onMouseLeave={() => onHoverFaceKey?.(null)} style={{ background: isHovered ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.07)', border: isHovered ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '10px 12px', transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s', boxShadow: isHovered ? '0 0 0 1px rgba(99,102,241,0.4), 0 0 10px rgba(99,102,241,0.25)' : 'none' }}>
      <SubjectHeader subject={subject} index={index} isHovered={isHovered} names={names} hasBbox={hasBbox} />
      <SubjectMetaTags subject={subject} />
      <SubjectDetails subject={subject} />
      {sourceLabel && <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>{sourceLabel}</div>}
    </div>
  );
};

function getSubjectIcon(subject: Record<string, unknown>): string {
  return subject.type === 'pet' ? '🐾' : '🧑';
}

function getSubjectLabel(subject: Record<string, unknown>, index: number): string {
  return (subject.label as string) || `Subject ${index + 1}`;
}

function getSubjectPinText(isHovered: boolean): string {
  return isHovered ? 'on image' : 'has box';
}

const SubjectMetaTags: React.FC<{ subject: Record<string, unknown> }> = ({ subject }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
    {Boolean(subject.location_desc) && <Tag text={`📍 ${String(subject.location_desc)}`} color="rgba(30,64,175,0.4)" />}
    {Boolean(subject.gender) && <Tag text={String(subject.gender)} color="rgba(99,102,241,0.3)" />}
    {Boolean(subject.age_range) && <Tag text={`~${String(subject.age_range)}`} color="rgba(20,83,45,0.5)" />}
    {Boolean(subject.emotion) && <Tag text={String(subject.emotion)} color="rgba(146,64,14,0.5)" />}
    {Boolean(subject.uniform) && <Tag text={`🎽 ${String(subject.uniform)}`} color="rgba(91,33,182,0.4)" />}
    {Boolean(subject.animal_type) && <Tag text={`🐾 ${String(subject.animal_type)}`} color="rgba(21,94,117,0.5)" />}
  </div>
);

const SubjectDetails: React.FC<{ subject: Record<string, unknown> }> = ({ subject }) => (
  <>
    {Boolean(subject.features) && <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>{String(subject.features)}</div>}
    {Boolean(subject.dob_range) && <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>Est. born: {String(subject.dob_range)}</div>}
  </>
);

const AiSubjectsSection: React.FC<{ subjects: Array<Record<string, unknown>>; hoveredFaceKey?: string | null; onHoverFaceKey?: (key: string | null) => void; sourceLabel?: string }> = ({ subjects, hoveredFaceKey, onHoverFaceKey, sourceLabel }) => {
  if (subjects.length === 0) {return null;}
  return <Section emoji="🤖" title="AI Subjects"><div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{subjects.map((subject, i) => <SubjectCard key={i} subject={subject} index={i} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} sourceLabel={sourceLabel} />)}</div></Section>;
};

export const PeopleTab: React.FC<PeopleTabProps> = ({ asset, hoveredFaceKey, onHoverFaceKey }) => {
  const summary = buildPhotoMetadataPeopleSummary(asset);
  const ai = asset.ai_metadata;
  const subjects = summary.subjects.length > 0
    ? summary.subjects.map((subject) => subject.raw)
    : (ai?.subjects as Array<Record<string, unknown>> | undefined) || [];
  const sourceLabel = summary.subjects[0]?.sourceLabel;
  const faces = (asset.faces || []);

  if (subjects.length === 0 && faces.length === 0) {return <EmptyPeopleState />;}

  return (
    <div>
      <RecognisedPeopleSection faces={faces} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} />
      <DetectedFacesSection faces={faces} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} />
      <AiSubjectsSection subjects={subjects} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} sourceLabel={sourceLabel} />
    </div>
  );
};
