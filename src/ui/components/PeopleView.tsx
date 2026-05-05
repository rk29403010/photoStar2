import { useEffect, useRef, useState } from 'react';
import type { Person } from '@contracts/core';
import type { LibraryFilter } from '../hooks/usePhotoLibrary';
import { resolveImageUrl } from '@boundary/runtime/backend';

type PeopleViewProps = {
    readonly people: Person[];
    readonly onFilter?: (filter: LibraryFilter) => void;
    readonly onSelectionChange?: (count: number) => void;
    readonly onRename?: (personId: string, newName: string) => void;
    readonly onMerge?: (personIds: string[], targetName: string) => void;
}

type MultiFilterType = 'person_any' | 'person_all' | 'person_only';

type SelectionActionConfig = {
    type: MultiFilterType;
    label: 'Any' | 'All' | 'Only';
    disabled: boolean;
};

function getPersonCardStyle(isSelected: boolean, isMultiSelect: boolean) {
    return {
        background: isSelected ? '#1e3a8a' : '#111',
        borderRadius: 16,
        padding: 20,
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        textAlign: 'center' as const,
        border: isSelected ? '2px solid #3b82f6' : '1px solid #222',
        transition: 'all 0.2s',
        cursor: 'pointer',
        opacity: isMultiSelect && !isSelected ? 0.6 : 1
    };
}

function getRejectedCountLabel(rejectedCount: number) {
    return `${rejectedCount} photo${rejectedCount === 1 ? '' : 's'} rejected`;
}

function getFaceCountLabel(faceCount: number) {
    return `${faceCount} ${faceCount === 1 ? 'photo' : 'photos'}`;
}

function PersonCover({ coverSrc }: { readonly coverSrc: string | null }) {
    return (
        <div style={{
            width: 120, height: 120, borderRadius: '50%', overflow: 'hidden', background: '#222',
            marginBottom: 16, border: '3px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            {coverSrc ? <img src={coverSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} /> : <span style={{ fontSize: '2rem', opacity: 0.3 }}>👤</span>}
        </div>
    );
}

function RejectedCountBadge({ rejectedCount }: { readonly rejectedCount: number }) {
    if (!rejectedCount) {
        return null;
    }

    return (
        <span style={{
            fontSize: '0.7rem', color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10, padding: '0px 5px', lineHeight: '1.4', cursor: 'help'
        }}>
            -{rejectedCount}
        </span>
    );
}

function PersonStats({ faceCount, rejectedCount }: { readonly faceCount: number; readonly rejectedCount: number }) {
    return (
        <div title={rejectedCount ? getRejectedCountLabel(rejectedCount) : undefined} style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: '500', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{getFaceCountLabel(faceCount)}</span>
            <RejectedCountBadge rejectedCount={rejectedCount} />
        </div>
    );
}

function usePeopleSelection(onSelectionChange?: (count: number) => void) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isMultiSelect, setIsMultiSelect] = useState(false);
    const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

    useEffect(() => {
        onSelectionChange?.(selectedIds.size);
    }, [onSelectionChange, selectedIds]);

    const updateSelected = (updater: (prev: Set<string>) => Set<string>) => {
        setSelectedIds((prev) => updater(prev));
    };

    const clearSelection = () => {
        setIsMultiSelect(false);
        setSelectedIds(new Set());
    };

    const startLongPressSelect = (id: string) => {
        if (isMultiSelect) {return;}
        timerRef.current = globalThis.setTimeout(() => {
            setIsMultiSelect(true);
            updateSelected(prev => new Set([...prev, id]));
            timerRef.current = null;
        }, 500);
    };

    const cancelLongPress = () => {
        if (!timerRef.current) {return;}
        clearTimeout(timerRef.current);
        timerRef.current = null;
    };

    return {
        selectedIds,
        isMultiSelect,
        setIsMultiSelect,
        updateSelected,
        clearSelection,
        startLongPressSelect,
        cancelLongPress,
        timerRef
    };
}

function PersonCard({
    person,
    isSelected,
    isMultiSelect,
    onPressStart,
    onPressEnd,
    onClick,
    editingId,
    editingName,
    setEditingId,
    setEditingName,
    onRename
}: Readonly<{
    person: Person;
    isSelected: boolean;
    isMultiSelect: boolean;
    onPressStart: () => void;
    onPressEnd: () => void;
    onClick: () => void;
    editingId: string | null;
    editingName: string;
    setEditingId: (id: string | null) => void;
    setEditingName: (name: string) => void;
    onRename?: (personId: string, newName: string) => void;
}>) {
    const coverSrc = resolveImageUrl(person.cover_image);
    const personName = person.name || 'Unknown';

    const saveName = () => {
        if (editingName.trim() && editingName !== person.name) {
            onRename?.(person.id, editingName.trim());
        }
        setEditingId(null);
    };

    return (
        <div
            key={person.id}
            style={getPersonCardStyle(isSelected, isMultiSelect)}
            onPointerDown={onPressStart}
            onPointerUp={onPressEnd}
            onPointerLeave={onPressEnd}
            onClick={onClick}
        >
            <PersonCover coverSrc={coverSrc} />

            <PersonNameEditor
                person={person}
                personName={personName}
                editingId={editingId}
                editingName={editingName}
                setEditingId={setEditingId}
                setEditingName={setEditingName}
                onSave={saveName}
            />

            <PersonStats faceCount={person.face_count} rejectedCount={person.rejected_count ?? 0} />
        </div>
    );
}

function PersonNameEditor({
    person,
    personName,
    editingId,
    editingName,
    setEditingId,
    setEditingName,
    onSave
}: Readonly<{
    person: Person;
    personName: string;
    editingId: string | null;
    editingName: string;
    setEditingId: (id: string | null) => void;
    setEditingName: (name: string) => void;
    onSave: () => void;
}>) {
    if (editingId === person.id) {
        return (
            <input
                autoFocus
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onClick={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
                onKeyDown={e => {
                    if (e.key === 'Enter') {onSave();}
                    else if (e.key === 'Escape') {setEditingId(null);}
                }}
                onBlur={onSave}
                style={{ width: '80%', padding: '4px', textAlign: 'center', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, marginBottom: 4 }}
            />
        );
    }

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                setEditingId(person.id);
                setEditingName(personName);
            }}
            onPointerDown={e => e.stopPropagation()}
            title="Click to rename"
            style={{ fontWeight: '600', color: '#fff', fontSize: '1rem', marginBottom: 4, cursor: 'text', padding: '0 8px', borderRadius: 4 }}
        >
            {personName}
        </div>
    );
}

function buildMultiFilter(
    type: MultiFilterType,
    selectedIds: Set<string>,
    people: Person[]
): LibraryFilter | null {
    if (selectedIds.size === 0) {return null;}
    const selectedPeople = people.filter((person) => selectedIds.has(person.id));
    const names = selectedPeople.map((person) => person.name || 'Unknown').join(', ');
    const typeDescription = type === 'person_any' ? 'Any of:' : type === 'person_all' ? 'All of:' : 'Only:';

    return {
        type,
        personIds: Array.from(selectedIds),
        description: `${typeDescription} ${names}`,
        persons: selectedPeople.map((person) => ({ id: person.id, name: person.name || 'Unknown' }))
    };
}

function getSelectionActions(selectedCount: number): SelectionActionConfig[] {
    return [
        { type: 'person_any', label: 'Any', disabled: selectedCount === 0 },
        { type: 'person_all', label: 'All', disabled: selectedCount < 2 },
        { type: 'person_only', label: 'Only', disabled: selectedCount === 0 }
    ];
}

function promptMergeTarget(selectedIds: Set<string>, people: Person[]): string | null {
    const canonical = people.find((person) => selectedIds.has(person.id));
    const suggestedName = canonical?.name || 'Unknown';
    return globalThis.prompt('Enter name for merged person:', suggestedName);
}

function SelectionActionButton({
    action,
    onClick
}: {
    readonly action: SelectionActionConfig;
    readonly onClick: () => void;
}) {
    const enabled = !action.disabled;
    return (
        <button
            onClick={onClick}
            disabled={action.disabled}
            style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: '#3b82f6', color: '#fff', cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.5, fontWeight: 'bold' }}
        >
            {action.label}
        </button>
    );
}

function SelectionActionBar({
    selectedIds,
    people,
    onFilter,
    onMerge,
    clearSelection
}: Readonly<{
    selectedIds: Set<string>;
    people: Person[];
    onFilter?: (filter: LibraryFilter) => void;
    onMerge?: (personIds: string[], targetName: string) => void;
    clearSelection: () => void;
}>) {
    const selectedCount = selectedIds.size;
    const actions = getSelectionActions(selectedCount);

    const handleMultiFilter = (type: MultiFilterType) => {
        const filter = buildMultiFilter(type, selectedIds, people);
        if (!filter) {return;}
        onFilter?.(filter);
        clearSelection();
    };

    const handleMerge = () => {
        const newName = promptMergeTarget(selectedIds, people);
        if (!newName) {return;}
        onMerge?.(Array.from(selectedIds), newName.trim());
        clearSelection();
    };

    return (
        <div style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: '#222', padding: '12px 24px', borderRadius: 32, display: 'flex', gap: 12, alignItems: 'center',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', border: '1px solid #333', zIndex: 50
        }}>
            <span style={{ color: '#d1d5db', marginRight: 8, fontSize: '0.9rem' }}>{selectedCount} selected</span>
            {actions.map((action) => (
                <SelectionActionButton
                    key={action.type}
                    action={action}
                    onClick={() => handleMultiFilter(action.type)}
                />
            ))}
            <div style={{ width: 1, height: 24, background: '#444', margin: '0 8px' }} />
            <button
                onClick={handleMerge}
                disabled={selectedCount < 2}
                style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: '#eab308', color: '#000', cursor: selectedCount > 1 ? 'pointer' : 'not-allowed', opacity: selectedCount > 1 ? 1 : 0.5, fontWeight: 'bold' }}
            >
                Merge
            </button>
            <div style={{ width: 1, height: 24, background: '#444', margin: '0 8px' }} />
            <button onClick={clearSelection} style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: '#444', color: '#fff', cursor: 'pointer' }}>Cancel</button>
        </div>
    );
}

export function PeopleView({ people, onFilter, onSelectionChange, onRename, onMerge }: PeopleViewProps) {
    const selection = usePeopleSelection(onSelectionChange);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');

    const handleClick = (person: Person) => {
        if (selection.isMultiSelect) {
            selection.updateSelected(prev => {
                const next = new Set(prev);
                if (next.has(person.id)) {next.delete(person.id);}
                else {next.add(person.id);}
                return next;
            });
            return;
        }

        selection.cancelLongPress();
        onFilter?.({
            type: 'person_any',
            personIds: [person.id],
            description: person.name || 'Unknown',
            persons: [{ id: person.id, name: person.name || 'Unknown' }]
        });
    };

    if (people.length === 0) {return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No people found.</div>;}

    return (
        <div style={{ position: 'relative', height: '100%', overflow: 'auto' }}>
            <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 24, background: '#0a0a0a', paddingBottom: selection.isMultiSelect ? 100 : 24 }}>
                {people.map(person => (
                    <PersonCard
                        key={person.id}
                        person={person}
                        isSelected={selection.selectedIds.has(person.id)}
                        isMultiSelect={selection.isMultiSelect}
                        onPressStart={() => selection.startLongPressSelect(person.id)}
                        onPressEnd={selection.cancelLongPress}
                        onClick={() => handleClick(person)}
                        editingId={editingId}
                        editingName={editingName}
                        setEditingId={setEditingId}
                        setEditingName={setEditingName}
                        onRename={onRename}
                    />
                ))}
            </div>

            {selection.isMultiSelect && (
                <SelectionActionBar
                    selectedIds={selection.selectedIds}
                    people={people}
                    onFilter={onFilter}
                    onMerge={onMerge}
                    clearSelection={selection.clearSelection}
                />
            )}
        </div>
    );
}
