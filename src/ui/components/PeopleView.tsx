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

function getRejectedCountLabel(rejectedCount: number) {
    return `${rejectedCount} photo${rejectedCount === 1 ? '' : 's'} rejected`;
}

function getFaceCountLabel(faceCount: number) {
    return `${faceCount} ${faceCount === 1 ? 'photo' : 'photos'}`;
}

function PersonCover({ coverSrc, alt }: { readonly coverSrc: string | null; readonly alt: string }) {
    return (
        <div className="w-28 h-28 rounded-full overflow-hidden bg-surface mb-4 border-2 border-content/10 flex items-center justify-center">
            {coverSrc ? <img loading="lazy" src={coverSrc} alt={alt} width={112} height={112} className="w-full h-full object-cover" draggable={false} /> : <span className="text-3xl opacity-30">👤</span>}
        </div>
    );
}

function RejectedCountBadge({ rejectedCount }: { readonly rejectedCount: number }) {
    if (!rejectedCount) {
        return null;
    }

    return (
        <span className="text-xs text-red-500 bg-red-500/10 border border-red-500/30 rounded px-1.5 py-0.5 leading-none cursor-help">
            -{rejectedCount}
        </span>
    );
}

function PersonStats({ faceCount, rejectedCount }: { readonly faceCount: number; readonly rejectedCount: number }) {
    return (
        <div title={rejectedCount ? getRejectedCountLabel(rejectedCount) : undefined} className="text-xs text-content-secondary font-medium flex items-center gap-1">
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
            className={`relative flex flex-col items-center text-center p-5 rounded-2xl border motion-safe:transition-all ${
                isSelected
                    ? 'bg-blue-600/20 border-brand-accent shadow-md shadow-brand-accent/20'
                    : 'bg-surface-secondary border-content/10 hover:border-content/20 text-content'
            } ${isMultiSelect && !isSelected ? 'opacity-60' : 'opacity-100'}`}
            onPointerDown={onPressStart}
            onPointerUp={onPressEnd}
            onPointerLeave={onPressEnd}
        >
            <button
                type="button"
                className="absolute inset-0 w-full h-full cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand-accent bg-transparent border-none"
                onClick={onClick}
                aria-label={`Select ${personName}`}
            />
            <PersonCover coverSrc={coverSrc} alt={personName} />

            <div className="relative z-10 w-full flex justify-center">
                <PersonNameEditor
                    person={person}
                    personName={personName}
                    editingId={editingId}
                    editingName={editingName}
                    setEditingId={setEditingId}
                    setEditingName={setEditingName}
                    onSave={saveName}
                />
            </div>

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
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                aria-label={`Rename ${personName}`}
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onClick={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
                onKeyDown={e => {
                    if (e.key === 'Enter') {onSave();}
                    else if (e.key === 'Escape') {setEditingId(null);}
                }}
                onBlur={onSave}
                className="w-4/5 p-1 text-center bg-surface text-content border border-content/20 rounded mb-1 outline-none focus:border-brand-accent text-sm"
            />
        );
    }

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                setEditingId(person.id);
                setEditingName(personName);
            }}
            onPointerDown={e => e.stopPropagation()}
            title="Click to rename"
            className="font-semibold text-content text-base mb-1 cursor-text px-2 rounded bg-transparent border-none hover:bg-content/5 font-inherit"
        >
            {personName}
        </button>
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
    let typeDescription = 'Only:';
    if (type === 'person_any') {
        typeDescription = 'Any of:';
    } else if (type === 'person_all') {
        typeDescription = 'All of:';
    }

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
            className={`px-4 py-2 rounded-full border-none font-bold text-white transition-opacity ${
                enabled ? 'bg-brand-accent cursor-pointer opacity-100 hover:bg-brand-accent-hover' : 'bg-brand-accent/50 cursor-not-allowed opacity-50'
            }`}
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
        <div 
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface-secondary p-3 px-6 rounded-full flex gap-3 items-center shadow-2xl border border-content/10"
            style={{ zIndex: 50 }}
        >
            <span className="text-content-secondary mr-2 text-sm">{selectedCount} selected</span>
            {actions.map((action) => (
                <SelectionActionButton
                    key={action.type}
                    action={action}
                    onClick={() => handleMultiFilter(action.type)}
                />
            ))}
            <div className="w-px h-6 bg-content/10 mx-2" />
            <button
                onClick={handleMerge}
                disabled={selectedCount < 2}
                className={`px-4 py-2 rounded-full border-none font-bold text-slate-950 transition-opacity ${
                    selectedCount > 1 ? 'bg-amber-500 cursor-pointer opacity-100 hover:bg-amber-600' : 'bg-amber-500/50 cursor-not-allowed opacity-50'
                }`}
            >
                Merge
            </button>
            <div className="w-px h-6 bg-content/10 mx-2" />
            <button onClick={clearSelection} className="px-4 py-2 rounded-full border-none bg-content/10 text-content hover:bg-content/20 transition-colors cursor-pointer">Cancel</button>
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

    if (people.length === 0) {return <div className="p-10 text-center text-content-secondary">No people found.</div>;}

    return (
        <div className="relative h-full overflow-auto bg-surface">
            <div 
                className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6"
                style={{ paddingBottom: selection.isMultiSelect ? 100 : 24 }}
            >
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
