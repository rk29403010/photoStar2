import { PERSON_COLORS } from '@contracts/core';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';

type AppFilterBarProps = {
  readonly view: 'library' | 'people' | 'familyTree' | 'dashboard' | 'albums' | 'reviews' | 'vocabulary' | 'workflows' | 'groupDiagnostics';
  readonly filterStack: LibraryFilter[];
  readonly showRejected: boolean;
  readonly onToggleRejected: (personId: string) => void;
  readonly onBack: () => void;
  readonly onClearAll: () => void;
}

const filterBarButtonStyle = {
  padding: '4px 12px',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 600,
};

function getSinglePersonId(filterStack: LibraryFilter[]): string | null {
  const currentFilter = filterStack[filterStack.length - 1];
  return currentFilter?.type === 'person_any' && currentFilter.personIds.length === 1
    ? currentFilter.personIds[0]
    : null;
}

function FilterTag({ filter }: { readonly filter: LibraryFilter }) {
  return (
    <div style={{ background: '#2563eb', padding: '4px 10px', borderRadius: 16, fontSize: '0.9rem', fontWeight: 500, display: 'flex', gap: 6 }}>
      {filter.persons && filter.persons.length > 0 ? (
        <>
          {filter.type === 'person_any' && filter.persons.length > 1 && <span>Any:</span>}
          {filter.type === 'person_all' && <span>All:</span>}
          {filter.type === 'person_only' && <span>Only:</span>}
          {filter.persons.map((person: { id: string; name: string }, index: number) => (
            <span key={person.id} style={{ borderBottom: `3px solid ${PERSON_COLORS[index % PERSON_COLORS.length]}` }}>{person.name}</span>
          ))}
        </>
      ) : (
        <span>{filter.description || filter.type}</span>
      )}
    </div>
  );
}

function FilterTrail({ filterStack }: { readonly filterStack: LibraryFilter[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {filterStack.map((filter, index) => (
        <div key={`${filter.type}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {index > 0 && <span style={{ color: '#60a5fa' }}>➜</span>}
          <FilterTag filter={filter} />
        </div>
      ))}
    </div>
  );
}

function RejectedToggleButton({
  singlePersonId,
  showRejected,
  onToggleRejected,
}: {
  readonly singlePersonId: string | null;
  readonly showRejected: boolean;
  readonly onToggleRejected: (personId: string) => void;
}) {
  if (!singlePersonId) {
    return null;
  }

  return (
    <button
      onClick={() => onToggleRejected(singlePersonId)}
      style={{
        ...filterBarButtonStyle,
        background: showRejected ? 'rgba(239,68,68,0.2)' : 'transparent',
        border: `1px solid ${showRejected ? '#ef4444' : '#3b82f6'}`,
        color: showRejected ? '#ef4444' : '#93c5fd',
        fontSize: '0.8rem',
      }}
    >
      {showRejected ? '🚫 Hide Rejected' : '🚫 Show Rejected'}
    </button>
  );
}

export function AppFilterBar({ view, filterStack, showRejected, onToggleRejected, onBack, onClearAll }: AppFilterBarProps) {
  if (view !== 'library' || filterStack.length === 0) {return null;}
  return (
    <FilterBarContent
      filterStack={filterStack}
      showRejected={showRejected}
      onToggleRejected={onToggleRejected}
      onBack={onBack}
      onClearAll={onClearAll}
    />
  );
}

function FilterBarContent({
  filterStack,
  showRejected,
  onToggleRejected,
  onBack,
  onClearAll
}: Omit<AppFilterBarProps, 'view'>) {
  const singlePersonId = getSinglePersonId(filterStack);
  const hasFilters = filterStack.length > 0;

  return (
    <div style={{ background: '#1e3a8a', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #1e40af' }}>
      {hasFilters && (
        <>
          <span style={{ fontWeight: 'bold' }}>Filtered:</span>
          <FilterTrail filterStack={filterStack} />
        </>
      )}
      <div style={{ flex: 1 }} />
      <RejectedToggleButton
        singlePersonId={singlePersonId}
        showRejected={showRejected}
        onToggleRejected={onToggleRejected}
      />
      {hasFilters && (
        <>
          <button onClick={onBack} style={{ ...filterBarButtonStyle, background: 'transparent', border: '1px solid #60a5fa', color: '#fff' }}>Back</button>
          <button onClick={onClearAll} style={{ ...filterBarButtonStyle, background: 'transparent', border: 'none', color: '#93c5fd', textDecoration: 'underline' }}>Clear All</button>
        </>
      )}
    </div>
  );
}
