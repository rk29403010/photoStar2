import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { Person } from '@contracts/core';
import type { LibraryFilter } from '../hooks/usePhotoLibrary';
import { resolveImageUrl } from '@boundary/runtime/backend';
import { globalRequest } from '@ui/hooks/usePhotoLibrary';
import { parseGedcom } from '../../services/gedcom/gedcomParser';
import { Trash2, Link2, Search } from 'lucide-react';

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

function personCardClass(isSelected: boolean, isMultiSelect: boolean): string {
    const selectionClass = isSelected
        ? 'bg-blue-600/20 border-brand-accent shadow-md shadow-brand-accent/20'
        : 'bg-surface-secondary border-content/10 hover:border-content/20 text-content';
    const opacityClass = isMultiSelect && !isSelected ? 'opacity-60' : 'opacity-100';
    return `relative flex flex-col items-center text-center p-5 rounded-2xl border motion-safe:transition-all ${selectionClass} ${opacityClass}`;
}

function PersonLifeDates({ person }: { readonly person: Person }) {
    if (!person.birth_date && !person.death_date) {return null;}
    return (
        <div className="text-xs text-content-secondary mt-0.5 mb-2 font-medium">
            {person.birth_date ? `* ${person.birth_date}` : ''}{' '}
            {person.death_date ? `† ${person.death_date}` : ''}
        </div>
    );
}

function PersonTreeBadge({ person }: { readonly person: Person }) {
    if (!person.gedcom_links?.length) {return null;}
    return (
        <span className="relative z-10 mt-2 text-[10px] bg-brand-accent/15 text-brand-accent px-2 py-0.5 rounded-full font-bold">
            🌳 Linked to Tree
        </span>
    );
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
            className={personCardClass(isSelected, isMultiSelect)}
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

            <PersonLifeDates person={person} />

            <PersonStats faceCount={person.face_count} rejectedCount={person.rejected_count ?? 0} />

            <PersonTreeBadge person={person} />
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

type FaceAssignmentInfo = {
    asset_id: string;
    face_index: number;
    confidence: number;
    is_suggested: number;
    original_path: string;
    preview_path: string | null;
};

type PersonDetailModalProps = {
    readonly person: Person;
    readonly onClose: () => void;
    readonly onFilter?: (filter: LibraryFilter) => void;
    readonly onRename?: (personId: string, newName: string) => void;
};

type FamilyTreeInfo = { id: string; filename: string; version_label?: string };

function usePersonDetailData(personId: string) {
    const [assignments, setAssignments] = useState<FaceAssignmentInfo[]>([]);
    const [trees, setTrees] = useState<FamilyTreeInfo[]>([]);
    const loadAssignments = useCallback(() => {
        if (!globalRequest) {return;}
        void globalRequest<{ assignments: FaceAssignmentInfo[] }>({
            idPrefix: 'get_person_face_assignments',
            command: 'get_person_face_assignments',
            payload: { personId },
            select: (d) => d as { assignments: FaceAssignmentInfo[] }
        }).then(res => {
            setAssignments(res.assignments || []);
        });
    }, [personId]);
    useEffect(() => {
        loadAssignments();
        if (!globalRequest) {return;}
        void globalRequest<{ trees: FamilyTreeInfo[] }>({
            idPrefix: 'get_family_trees',
            command: 'get_family_trees',
            payload: {},
            select: (data) => data as { trees: FamilyTreeInfo[] }
        }).then(result => setTrees(result.trees || []));
    }, [loadAssignments]);
    return { assignments, loadAssignments, trees };
}

function useFaceAssignmentActions(personId: string, reload: () => void) {
    const run = async (command: string, payload: Record<string, unknown>) => {
        if (!globalRequest) {return;}
        await globalRequest({
            idPrefix: command,
            command,
            payload,
            select: (d) => d
        });
        reload();
        globalThis.dispatchEvent(new CustomEvent('refresh-people-list'));
    };
    const confirm = (assetId: string, faceIndex: number) =>
        run('confirm_face_assignment', { assetId, faceIndex });
    const reject = (assetId: string, faceIndex: number) =>
        run('reject_face_assignment', { assetId, faceIndex, personId });
    const unmatch = async (assetId: string, faceIndex: number) => {
        if (!globalThis.confirm('Are you sure you want to isolate/unmatch this photo from this person?')) {return;}
        await run('isolate_face', { assetId, faceIndex });
    };
    return { confirm, reject, unmatch };
}

function PersonDetailHeader(props: {
    readonly person: Person;
    readonly trees: FamilyTreeInfo[];
    readonly onClose: () => void;
    readonly onRename?: (personId: string, name: string) => void;
    readonly onViewPhotos: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [nameText, setNameText] = useState(props.person.name || '');
    const handleSaveName = () => {
        if (nameText.trim() && nameText.trim() !== props.person.name) {
            props.onRename?.(props.person.id, nameText.trim());
        }
        setEditing(false);
    };
    const cancelEditing = () => {
        setEditing(false);
        setNameText(props.person.name || '');
    };
    return (
        <div className="flex justify-between items-start border-b border-content/10 pb-4 mb-4">
            <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-3">
                    {editing ? (
                        <input autoFocus value={nameText} onChange={event => setNameText(event.target.value)}
                            onBlur={handleSaveName} onKeyDown={event => {
                                if (event.key === 'Enter') {handleSaveName();}
                                if (event.key === 'Escape') {cancelEditing();}
                            }} />
                    ) : (
                        <button type="button" onClick={() => setEditing(true)}>{props.person.name || 'Unknown'}</button>
                    )}
                    <button onClick={props.onViewPhotos}>View Gallery</button>
                </div>
                <PersonLifeDates person={props.person} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {props.person.gedcom_links?.map(link => (
                        <span key={`${link.treeId}-${link.personId}`} className="text-xs text-brand-accent">
                            🌳 {props.trees.find(tree => tree.id === link.treeId)?.filename || 'Family Tree'} (ID: {link.personId})
                        </span>
                    ))}
                </div>
            </div>
            <button onClick={props.onClose} aria-label="Close person details">×</button>
        </div>
    );
}

function AssignmentGrid(props: {
    readonly assignments: FaceAssignmentInfo[];
    readonly suggested: boolean;
    readonly actions: ReturnType<typeof useFaceAssignmentActions>;
}) {
    if (props.assignments.length === 0) {
        return <div className="p-6 bg-content/5 rounded-xl text-center text-sm text-content-secondary">No {props.suggested ? 'suggested matches' : 'confirmed photos'}.</div>;
    }
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {props.assignments.map(assignment => (
                <div key={`${assignment.asset_id}-${assignment.face_index}`} className="relative group rounded-lg overflow-hidden border border-content/10 bg-surface-secondary aspect-square">
                    <img src={resolveImageUrl(assignment.preview_path || assignment.original_path) || undefined}
                        alt={props.suggested ? 'Suggested person match' : 'Confirmed person match'} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2">
                        {props.suggested ? (
                            <><button onClick={() => props.actions.confirm(assignment.asset_id, assignment.face_index)}>Approve</button>
                            <button onClick={() => props.actions.reject(assignment.asset_id, assignment.face_index)}>Reject</button></>
                        ) : (
                            <button onClick={() => props.actions.unmatch(assignment.asset_id, assignment.face_index)} title="Unmatch / Isolate Face"><Trash2 className="w-4 h-4" /></button>
                        )}
                    </div>
                    <div className="absolute bottom-1 right-1 bg-black/60 px-1 text-[9px] text-white">
                        {(assignment.confidence * 100).toFixed(0)}%
                    </div>
                </div>
            ))}
        </div>
    );
}

function PersonDetailModal({ person, onClose, onFilter, onRename }: PersonDetailModalProps) {
    const [showLinker, setShowLinker] = useState(false);
    const data = usePersonDetailData(person.id);
    const actions = useFaceAssignmentActions(person.id, data.loadAssignments);
    const viewPhotos = () => {
        if (!onFilter) {return;}
        onFilter({ type: 'person_any', personIds: [person.id], description: person.name || 'Unknown',
            persons: [{ id: person.id, name: person.name || 'Unknown' }] });
        onClose();
    };
    const closeLinker = () => setShowLinker(false);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-4 overflow-y-auto">
            <dialog className="w-full max-w-4xl rounded-xl border bg-surface p-6 text-content flex flex-col max-h-[90vh]" open>
                <PersonDetailHeader person={person} trees={data.trees} onClose={onClose} onRename={onRename} onViewPhotos={viewPhotos} />
                <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                    <section><h3>Confirmed Photos</h3><AssignmentGrid assignments={data.assignments.filter(item => item.is_suggested === 0)} suggested={false} actions={actions} /></section>
                    <section><h3>Suggested Matches</h3><AssignmentGrid assignments={data.assignments.filter(item => item.is_suggested === 1)} suggested actions={actions} /></section>
                </div>
                <div className="mt-4 border-t border-content/10 pt-4 flex justify-between">
                    <button onClick={() => setShowLinker(true)}><Link2 className="w-3.5 h-3.5" /> Link to Family Tree</button>
                    <button onClick={onClose}>Close</button>
                </div>
            </dialog>
            {showLinker && <TreeLinkerDialog person={person} trees={data.trees} onClose={closeLinker}
                onLinkComplete={() => { closeLinker(); data.loadAssignments(); }} />}
        </div>
    );
}

type TreeLinkerDialogProps = {
    readonly person: Person;
    readonly trees: Array<{ id: string; filename: string; version_label?: string }>;
    readonly onClose: () => void;
    readonly onLinkComplete: () => void;
};

type GedcomCandidate = {
    id: string;
    name: string;
    gender: string;
    birthDate?: string;
    deathDate?: string;
};

function candidateScore(personName: string, candidateName: string): number {
    const personParts = personName.toLowerCase().split(/\s+/).filter(Boolean);
    const candidateParts = candidateName.toLowerCase().split(/\s+/).filter(Boolean);
    if (personParts.length === 0 || candidateParts.length === 0) {return 0;}
    const commonParts = personParts.filter(part => candidateParts.includes(part)).length;
    return Math.round((commonParts / Math.max(personParts.length, candidateParts.length)) * 100);
}

function useGedcomCandidates(treeId: string, personName: string, search: string) {
    const [people, setPeople] = useState<GedcomCandidate[]>([]);
    useEffect(() => {
        if (!treeId || !globalRequest) {
            setPeople([]);
            return;
        }
        void globalRequest<{ content: string }>({
            idPrefix: 'get_linker_content', command: 'get_family_tree_content',
            payload: { treeId }, select: (data) => data as { content: string }
        }).then(result => setPeople(Object.values(parseGedcom(result.content).people)));
    }, [treeId]);
    return useMemo(() => {
        const ranked = people.map(person => ({
            ...person,
            score: candidateScore(personName, person.name),
        })).sort((left, right) => right.score - left.score);
        if (!search) {return ranked;}
        const query = search.toLowerCase();
        return ranked.filter(candidate => candidate.name.toLowerCase().includes(query));
    }, [people, personName, search]);
}

function TreeCandidatePicker(props: {
    readonly candidates: Array<GedcomCandidate & { score: number }>;
    readonly search: string;
    readonly selectedTreeId: string;
    readonly trees: FamilyTreeInfo[];
    readonly onSearchChange: (search: string) => void;
    readonly onSelectCandidate: (id: string) => void;
    readonly onTreeChange: (id: string) => void;
}) {
    return (
        <>
            <div className="space-y-3 mb-4">
                <label htmlFor="linker-choose-tree">Choose Family Tree</label>
                <select id="linker-choose-tree" value={props.selectedTreeId}
                    onChange={event => props.onTreeChange(event.target.value)}>
                    <option value="">Select a tree...</option>
                    {props.trees.map(tree => <option key={tree.id} value={tree.id}>{tree.filename}</option>)}
                </select>
                {props.selectedTreeId && <div>
                    <label htmlFor="linker-search-node">Search Node</label>
                    <div className="relative"><Search className="w-4 h-4" />
                        <input id="linker-search-node" value={props.search}
                            onChange={event => props.onSearchChange(event.target.value)} placeholder="Search name in tree..." />
                    </div>
                </div>}
            </div>
            {props.selectedTreeId && <div className="max-h-60 overflow-y-auto space-y-1 mb-4">
                {props.candidates.map(candidate => (
                    <button key={candidate.id} type="button" onClick={() => props.onSelectCandidate(candidate.id)}>
                        <span>{candidate.name}</span>
                        <span>{candidate.birthDate ? `* ${candidate.birthDate}` : ''} {candidate.deathDate ? `† ${candidate.deathDate}` : ''}</span>
                        {candidate.score > 0 && <span>Match: {candidate.score}%</span>}
                    </button>
                ))}
            </div>}
        </>
    );
}

function TreeLinkerDialog({ person, trees, onClose, onLinkComplete }: TreeLinkerDialogProps) {
    const [selectedTreeId, setSelectedTreeId] = useState('');
    const [search, setSearch] = useState('');
    const candidates = useGedcomCandidates(selectedTreeId, person.name || '', search);

    const handleSelect = async (gpId: string) => {
        if (!globalRequest) {return;}
        try {
            await globalRequest({
                idPrefix: 'link_linker_person',
                command: 'link_person_to_gedcom',
                payload: {
                    personId: person.id,
                    gedcomTreeId: selectedTreeId,
                    gedcomPersonId: gpId
                },
                select: (d) => d
            });
            onLinkComplete();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        }
    };

    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 px-4">
            <dialog className="w-full max-w-md rounded-xl border border-content/10 bg-surface p-6 text-content shadow-2xl" open>
                <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                    <Link2 className="w-5 h-5 text-brand-accent" /> Select Family Tree Profile
                </h3>
                <TreeCandidatePicker candidates={candidates} search={search} selectedTreeId={selectedTreeId}
                    trees={trees} onSearchChange={setSearch} onSelectCandidate={handleSelect} onTreeChange={setSelectedTreeId} />
                <div className="flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm bg-surface-secondary hover:bg-content/5 rounded-lg border-none cursor-pointer"
                    >
                        Cancel
                    </button>
                </div>
            </dialog>
        </div>
    );
}

export function PeopleView({ people, onFilter, onSelectionChange, onRename, onMerge }: PeopleViewProps) {
    const selection = usePeopleSelection(onSelectionChange);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [selectedPersonForDetail, setSelectedPersonForDetail] = useState<Person | null>(null);

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
        setSelectedPersonForDetail(person);
    };

    useEffect(() => {
        const handleRefresh = () => {
            if (selectedPersonForDetail) {
                const updated = people.find(p => p.id === selectedPersonForDetail.id);
                if (updated) {
                    setSelectedPersonForDetail(updated);
                } else {
                    setSelectedPersonForDetail(null);
                }
            }
        };
        globalThis.addEventListener('refresh-people-list', handleRefresh);
        return () => globalThis.removeEventListener('refresh-people-list', handleRefresh);
    }, [people, selectedPersonForDetail]);

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

            {selectedPersonForDetail && (
                <PersonDetailModal
                    person={selectedPersonForDetail}
                    onClose={() => {
                        setSelectedPersonForDetail(null);
                        globalThis.dispatchEvent(new CustomEvent('refresh-people-list'));
                    }}
                    onFilter={onFilter}
                    onRename={onRename}
                />
            )}
        </div>
    );
}
