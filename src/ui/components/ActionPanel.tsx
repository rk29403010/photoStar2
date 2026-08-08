import { useEffect, useRef, useState } from 'react';
import { canUseNativeDirectoryPicker } from '@boundary/runtime/backend';
import { globalRequest } from '@ui/hooks/usePhotoLibrary';
import type { AppView } from '@ui/hooks/useAppRuntimeUi';
import { parseGedcom } from '../../services/gedcom/gedcomParser';
import { Button, Checkbox, Input, Select } from './Primitives';

type FolderIngestOptions = {
    path?: string;
    includeSubfolders: boolean;
};

type ActionPanelProps = {
    readonly isOpen: boolean;
    readonly onClose: () => void;
    readonly onScan: (options: FolderIngestOptions) => void;
    readonly onPreviews: () => void;
    readonly onDetect: () => void;
    readonly onCluster: () => void;
    readonly onRecalculatePhotoDates: () => Promise<string>;
    readonly onExtractAiMetadata: () => void;
    readonly onScanSensitive: () => void;
    readonly onScanSensitiveAll: () => void;
    readonly onRefresh: () => void;
    readonly onResetFaces: () => void;
    readonly onResetAll: () => void;
    readonly onFactoryReset: () => void;
    readonly onResetGroupingData: () => void;
    readonly onStopScan: () => void;
    readonly onOpenGroupDiagnostics: () => void;
    readonly onStartSimulationWorkflow: () => void;
    readonly onOpenSettings: () => void;
    readonly folderHistory?: { path: string; last_scanned_at: string }[];
    readonly selectedAssetIds?: string[];
    readonly onRunWorkflowOnAssets?: (workflowId: string, assetIds: string[], parameters?: Record<string, unknown>) => void;
};

type MenuItem = {
    label: string;
    disabled?: boolean;
    tone?: 'danger';
    onClick: () => void;
};

type MenuGroup = {
    label: string;
    items: MenuItem[];
};

type MenuEntry = MenuGroup | MenuItem;

type IngestTreeInfo = {
    id: string;
    filename: string;
    version_label?: string;
};

type IngestPersonInfo = {
    id: string;
    name: string;
};

function MenuItemButton({ item }: { readonly item: MenuItem }) {
    return (
        <button
            type="button"
            disabled={item.disabled}
            onClick={item.onClick}
            className={`flex w-full break-words px-3 py-2 text-left text-sm transition-colors focus-visible:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-brand-accent focus-visible:outline-offset-[-2px] disabled:cursor-not-allowed disabled:opacity-50 ${
                item.tone === 'danger'
                    ? 'text-red-600 hover:bg-red-600/10 dark:text-red-400'
                    : 'text-content hover:bg-surface-secondary'
            }`}
        >
            {item.label}
        </button>
    );
}

function isMenuGroup(entry: MenuEntry): entry is MenuGroup {
    return 'items' in entry;
}

function saveIngestSetting(key: string, value: string) {
    if (!globalRequest) {return;}
    void globalRequest({
        idPrefix: `save_${key}`,
        command: 'save_setting',
        payload: { key, value },
    });
}

function IngestGedcomSettings() {
    const [trees, setTrees] = useState<IngestTreeInfo[]>([]);
    const [selectedTreeId, setSelectedTreeId] = useState('');
    const [people, setPeople] = useState<IngestPersonInfo[]>([]);
    const [selectedHomePersonId, setSelectedHomePersonId] = useState('');

    useEffect(() => {
        if (!globalRequest) {return;}
        void globalRequest<{ trees: IngestTreeInfo[] }>({
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- backend response is validated by the family-tree command contract.
            idPrefix: 'get_family_trees', command: 'get_family_trees', payload: {}, select: (data) => data as { trees: IngestTreeInfo[] },
        }).then((result) => setTrees(result.trees || []));
        void globalRequest<{ value: string }>({
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- settings command returns the requested scalar value.
            idPrefix: 'get_default_tree_setting', command: 'get_setting', payload: { key: 'default_gedcom_tree_id' }, select: (data) => data as { value: string },
        }).then((result) => setSelectedTreeId(result.value || ''));
        void globalRequest<{ value: string }>({
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- settings command returns the requested scalar value.
            idPrefix: 'get_default_home_setting', command: 'get_setting', payload: { key: 'default_home_person_id' }, select: (data) => data as { value: string },
        }).then((result) => setSelectedHomePersonId(result.value || ''));
    }, []);

    useEffect(() => {
        if (!selectedTreeId || !globalRequest) {
            setPeople([]);
            return;
        }
        void globalRequest<{ content: string }>({
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- family-tree command returns its GEDCOM content payload.
            idPrefix: 'get_tree_content', command: 'get_family_tree_content', payload: { treeId: selectedTreeId }, select: (data) => data as { content: string },
        }).then((result) => setPeople(Object.values(parseGedcom(result.content).people)));
    }, [selectedTreeId]);

    return (
        <fieldset className="flex flex-col gap-3 border-t border-content/10 pt-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-content-secondary">Optional family tree settings</legend>
            <label className="flex flex-col gap-1 text-sm text-content">
                Default family tree
                <Select name="default-family-tree" value={selectedTreeId} onChange={(event) => {
                    setSelectedTreeId(event.target.value);
                    setSelectedHomePersonId('');
                    saveIngestSetting('default_gedcom_tree_id', event.target.value);
                    saveIngestSetting('default_home_person_id', '');
                }}>
                    <option value="">None</option>
                    {trees.map((tree) => <option key={tree.id} value={tree.id}>{tree.filename} ({tree.version_label || 'v1'})</option>)}
                </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-content">
                Default home person
                <Select name="default-home-person" value={selectedHomePersonId} disabled={!selectedTreeId} onChange={(event) => {
                    setSelectedHomePersonId(event.target.value);
                    saveIngestSetting('default_home_person_id', event.target.value);
                }}>
                    <option value="">Select a home person</option>
                    {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </Select>
            </label>
        </fieldset>
    );
}

function FolderIngestDialog(props: {
    readonly initialPath?: string;
    readonly onClose: () => void;
    readonly onStart: (options: FolderIngestOptions) => void;
}) {
    const [path, setPath] = useState(props.initialPath || '');
    const [includeSubfolders, setIncludeSubfolders] = useState(true);
    const useNativePicker = canUseNativeDirectoryPicker();
    const canStart = useNativePicker || path.trim().length > 0;

    const handleStart = () => {
        if (!canStart) {return;}
        props.onStart({
            path: useNativePicker ? undefined : path.trim(),
            includeSubfolders,
        });
        props.onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overscroll-contain">
            <dialog
                open
                aria-modal="true"
                aria-labelledby="folder-ingest-title"
                onCancel={(event) => {
                    event.preventDefault();
                    props.onClose();
                }}
                className="w-full max-w-lg rounded-xl border border-content/10 bg-surface p-6 text-content shadow-2xl"
            >
                <div className="mb-5">
                    <h2 id="folder-ingest-title" className="text-lg font-semibold text-content">Folder Ingest</h2>
                    <p className="mt-1 text-sm text-content-secondary">Choose a folder and select how much of its structure to ingest.</p>
                </div>
                <div className="flex flex-col gap-4">
                    {useNativePicker ? (
                        <p className="text-sm text-content-secondary">The folder picker opens after you start the ingest.</p>
                    ) : (
                        <label htmlFor="folder-path" className="flex flex-col gap-1 text-sm text-content">
                            Folder path
                            <Input id="folder-path" autoFocus name="folder-path" autoComplete="off" value={path} onChange={(event) => setPath(event.target.value)} placeholder="C:/Users/robin/Photos…" />
                        </label>
                    )}
                    <label htmlFor="include-subfolders" className="flex items-start gap-3 text-sm text-content">
                        <Checkbox id="include-subfolders" checked={includeSubfolders} onChange={(event) => setIncludeSubfolders(event.target.checked)} />
                        <span>
                            <span className="block font-medium">Include Subfolders</span>
                            <span className="block text-content-secondary">Find images in nested folders as well as this folder.</span>
                        </span>
                    </label>
                    <IngestGedcomSettings />
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={props.onClose}>Cancel</Button>
                    <Button type="button" disabled={!canStart} onClick={handleStart}>{useNativePicker ? 'Choose Folder and Ingest' : 'Start Ingest'}</Button>
                </div>
            </dialog>
        </div>
    );
}

function MenuGroupButton(props: {
    readonly group: MenuGroup;
    readonly isActive: boolean;
    readonly onToggle: () => void;
}) {
    return (
        <button
            type="button"
            aria-expanded={props.isActive}
            onClick={props.onToggle}
            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand-accent focus-visible:outline-offset-[-2px] ${
                props.isActive ? 'bg-surface-secondary text-content' : 'text-content hover:bg-surface-secondary'
            }`}
        >
            <span>{props.group.label}</span>
            <span aria-hidden="true">›</span>
        </button>
    );
}

function ActionDropdown(props: {
    readonly entries: MenuEntry[];
    readonly onClose: () => void;
}) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [activeGroupLabel, setActiveGroupLabel] = useState<string | null>(null);
    const activeGroup = props.entries.find((entry): entry is MenuGroup => isMenuGroup(entry) && entry.label === activeGroupLabel) ?? null;

    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) {
                props.onClose();
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (activeGroup) {
                    setActiveGroupLabel(null);
                } else {
                    props.onClose();
                }
            }
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeGroup, props]);

    return (
        <div ref={menuRef} aria-label="Actions" className="fixed right-4 top-16 z-40 flex items-start">
            <div className="w-56 rounded-lg border border-content/10 bg-surface py-1 shadow-lg">
                {props.entries.map((entry) => {
                    if (!isMenuGroup(entry)) {
                        return <MenuItemButton key={entry.label} item={entry} />;
                    }
                    const group = entry;
                    const isActive = activeGroup?.label === group.label;
                    return <MenuGroupButton
                            key={group.label}
                            group={group}
                            isActive={isActive}
                            onToggle={() => setActiveGroupLabel(isActive ? null : group.label)}
                        />;
                })}
            </div>
            {activeGroup && (
                <section aria-label={`${activeGroup.label} actions`} className="ml-1 max-h-screen w-72 overflow-y-auto rounded-lg border border-content/10 bg-surface py-1 shadow-lg">
                    <h2 className="border-b border-content/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-content-secondary">{activeGroup.label}</h2>
                    {activeGroup.items.map((item) => <MenuItemButton key={item.label} item={item} />)}
                </section>
            )}
        </div>
    );
}

function confirmThen(message: string, action: () => void, onClose: () => void) {
    return () => {
        if (globalThis.confirm(message)) {
            action();
            onClose();
        }
    };
}

function buildMenuEntries(
    props: ActionPanelProps,
    openFolderIngest: (path?: string) => void,
): MenuEntry[] {
    const closeThen = (action: () => void) => () => {
        action();
        props.onClose();
    };
    const navigateTo = (view: AppView) => closeThen(() => {
        globalThis.dispatchEvent(new CustomEvent<AppView>('change-view', { detail: view }));
    });
    const selectedAssetIds = props.selectedAssetIds || [];
    const selectionAction = (workflowId: string) => () => {
        props.onRunWorkflowOnAssets?.(workflowId, selectedAssetIds);
        props.onClose();
    };
    const selectionDisabled = selectedAssetIds.length === 0;

    return [
        {
            label: 'Ingest',
            items: [
                { label: 'Folder Ingest…', onClick: () => openFolderIngest() },
                ...((props.folderHistory || []).map((entry) => ({ label: `Recent: ${entry.path}`, onClick: () => openFolderIngest(entry.path) }))),
                { label: 'Watched Folder (Coming Soon)', disabled: true, onClick: () => undefined },
                { label: 'Stop Current Scan', onClick: closeThen(props.onStopScan) },
            ],
        },
        {
            label: 'Workflows',
            items: [
                { label: 'Workflow Management', onClick: navigateTo('workflows') },
                { label: 'Module Maintenance', onClick: navigateTo('moduleMaintenance') },
                { label: 'Generate Library Previews', onClick: closeThen(props.onPreviews) },
                { label: 'Run Face Workflow', onClick: closeThen(props.onDetect) },
                { label: 'Run Grouping Workflow', onClick: closeThen(props.onCluster) },
                { label: 'Recalculate Photo Dates', onClick: closeThen(() => void props.onRecalculatePhotoDates()) },
                { label: 'Scan Sensitive Content', onClick: closeThen(props.onScanSensitive) },
                { label: 'Re-run Sensitive Scan', onClick: confirmThen('This will re-run the sensitive content workflow across the library. Continue?', props.onScanSensitiveAll, props.onClose) },
                { label: 'Run AI Metadata', onClick: closeThen(props.onExtractAiMetadata) },
                { label: 'Simulate Workflow', onClick: closeThen(props.onStartSimulationWorkflow) },
            ],
        },
        {
            label: 'Selected Photos',
            items: [
                { label: 'Generate Previews', disabled: selectionDisabled, onClick: selectionAction('library_previews_v1') },
                { label: 'Run Face Workflow', disabled: selectionDisabled, onClick: selectionAction('library_face_pipeline_v1') },
                { label: 'Run AI Metadata', disabled: selectionDisabled, onClick: selectionAction('library_ai_metadata_v1') },
                { label: 'Scan Sensitive Content', disabled: selectionDisabled, onClick: selectionAction('library_sensitive_scan_v1') },
                { label: 'Recalculate Photo Dates', disabled: selectionDisabled, onClick: selectionAction('library_photo_date_v1') },
                { label: 'Detect Frames', disabled: selectionDisabled, onClick: selectionAction('library_detect_frames_v1') },
            ],
        },
        {
            label: 'Library Management',
            items: [
                { label: 'Refresh Library', onClick: closeThen(props.onRefresh) },
                { label: 'Grouping Diagnostics Report', onClick: closeThen(props.onOpenGroupDiagnostics) },
                { label: 'Reset All Grouping Data', onClick: confirmThen('This will remove automatic grouping results and manual grouping decisions so grouping can be rerun from scratch. Continue?', props.onResetGroupingData, props.onClose) },
            ],
        },
        {
            label: 'Administrator Management',
            items: [
                { label: 'Soft Reset Database', tone: 'danger', onClick: confirmThen('This will clear operational library data and previews, but keep manual data so it can be re-applied after a rescan. Continue?', props.onResetAll, props.onClose) },
                { label: 'Reset Face Data', tone: 'danger', onClick: confirmThen('Are you sure you want to reset faces? This will clear all detection data.', props.onResetFaces, props.onClose) },
                { label: 'Factory Reset Database', tone: 'danger', onClick: confirmThen('WARNING: This will delete the internal database, manual overrides, manual face naming/isolation data, settings, and generated thumbnails. Your original photo files will not be deleted. Continue?', props.onFactoryReset, props.onClose) },
            ],
        },
        { label: 'Reviews', onClick: navigateTo('reviews') },
        { label: 'Vocabulary', onClick: navigateTo('vocabulary') },
        { label: 'Dashboard', onClick: navigateTo('dashboard') },
        { label: 'Settings', onClick: closeThen(props.onOpenSettings) },
    ];
}

export function ActionPanel(props: ActionPanelProps) {
    const [folderIngestRequest, setFolderIngestRequest] = useState<{ initialPath?: string } | null>(null);

    const openFolderIngest = (path?: string) => {
        setFolderIngestRequest({ initialPath: path });
        props.onClose();
    };
    const closeFolderIngest = () => setFolderIngestRequest(null);
    const entries = buildMenuEntries(props, openFolderIngest);

    return (
        <>
            {props.isOpen && <ActionDropdown entries={entries} onClose={props.onClose} />}
            {folderIngestRequest && <FolderIngestDialog initialPath={folderIngestRequest.initialPath} onClose={closeFolderIngest} onStart={props.onScan} />}
        </>
    );
}
