import { PERSON_COLORS } from '@contracts/core';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';

interface AppFilterBarProps {
  view: 'library' | 'people' | 'dashboard' | 'albums' | 'workflows';
  filterStack: LibraryFilter[];
  librarySelection: Set<string>;
  showRejected: boolean;
  onDeclusterSelection: (personId: string) => void;
  onClearSelection: () => void;
  onToggleRejected: (personId: string) => void;
  onBack: () => void;
  onClearAll: () => void;
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

function FilterTag({ filter }: { filter: LibraryFilter }) {
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

function FilterTrail({ filterStack }: { filterStack: LibraryFilter[] }) {
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

function SelectionActions({
  selectionCount,
  singlePersonId,
  onDeclusterSelection,
  onClearSelection,
}: {
  selectionCount: number;
  singlePersonId: string | null;
  onDeclusterSelection: (personId: string) => void;
  onClearSelection: () => void;
}) {
  if (selectionCount === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginRight: '16px', borderRight: '1px solid #3b82f6', paddingRight: '16px' }}>
      <span style={{ fontSize: '0.85rem', color: '#93c5fd', fontWeight: 600 }}>{selectionCount} Selected</span>
      {singlePersonId && (
        <button onClick={() => onDeclusterSelection(singlePersonId)} style={{ ...filterBarButtonStyle, background: '#ef4444', border: 'none', color: '#fff', fontSize: '0.8rem' }}>
          Decluster
        </button>
      )}
      <button onClick={onClearSelection} style={{ ...filterBarButtonStyle, background: '#3b82f6', border: 'none', color: '#fff', fontSize: '0.8rem' }}>
        Clear Selection
      </button>
    </div>
  );
}

function RejectedToggleButton({
  singlePersonId,
  showRejected,
  onToggleRejected,
}: {
  singlePersonId: string | null;
  showRejected: boolean;
  onToggleRejected: (personId: string) => void;
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

export function AppFilterBar({ view, filterStack, librarySelection, showRejected, onDeclusterSelection, onClearSelection, onToggleRejected, onBack, onClearAll }: AppFilterBarProps) {
  if (view !== 'library' || filterStack.length === 0) {return null;}
  return (
    <FilterBarContent
      filterStack={filterStack}
      librarySelection={librarySelection}
      showRejected={showRejected}
      onDeclusterSelection={onDeclusterSelection}
      onClearSelection={onClearSelection}
      onToggleRejected={onToggleRejected}
      onBack={onBack}
      onClearAll={onClearAll}
    />
  );
}

function FilterBarContent({
  filterStack,
  librarySelection,
  showRejected,
  onDeclusterSelection,
  onClearSelection,
  onToggleRejected,
  onBack,
  onClearAll
}: Omit<AppFilterBarProps, 'view'>) {
  const singlePersonId = getSinglePersonId(filterStack);

  return (
    <div style={{ background: '#1e3a8a', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #1e40af' }}>
      <span style={{ fontWeight: 'bold' }}>Filtered:</span>
      <FilterTrail filterStack={filterStack} />
      <div style={{ flex: 1 }} />
      <SelectionActions
        selectionCount={librarySelection.size}
        singlePersonId={singlePersonId}
        onDeclusterSelection={onDeclusterSelection}
        onClearSelection={onClearSelection}
      />
      <RejectedToggleButton
        singlePersonId={singlePersonId}
        showRejected={showRejected}
        onToggleRejected={onToggleRejected}
      />
      <button onClick={onBack} style={{ ...filterBarButtonStyle, background: 'transparent', border: '1px solid #60a5fa', color: '#fff' }}>Back</button>
      <button onClick={onClearAll} style={{ ...filterBarButtonStyle, background: 'transparent', border: 'none', color: '#93c5fd', textDecoration: 'underline' }}>Clear All</button>
    </div>
  );
}
