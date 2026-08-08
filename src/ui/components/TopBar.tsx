import type React from 'react';
import { Button } from './Primitives';

type TopBarProps = {
    readonly view: 'library' | 'people' | 'familyTree' | 'dashboard' | 'albums' | 'reviews' | 'vocabulary' | 'workflows' | 'moduleMaintenance' | 'groupDiagnostics';
    readonly setView: (view: 'library' | 'people' | 'familyTree' | 'dashboard' | 'albums' | 'reviews' | 'vocabulary' | 'workflows' | 'moduleMaintenance' | 'groupDiagnostics') => void;
    readonly onOpenActions: () => void;
    readonly onOpenSettings: () => void;
    readonly showSettings: boolean;
};

type ViewType = TopBarProps['view'];

function formatViewLabel(view: ViewType) {
    if (view === 'groupDiagnostics') {return 'Diagnostics';}
    if (view === 'familyTree') {return 'Family Tree';}
    if (view === 'moduleMaintenance') {return 'Module Maintenance';}
    return view[0].toUpperCase() + view.slice(1);
}

function ViewButton({
    view,
    current,
    setView,
}: {
    readonly view: ViewType;
    readonly current: ViewType;
    readonly setView: (view: ViewType) => void;
}) {
    const selected = current === view;
    return (
        <Button
            onClick={() => setView(view)}
            disabled={selected}
            variant={selected ? 'primary' : 'secondary'}
            className="px-4 py-1.5 text-sm"
        >
            {formatViewLabel(view)}
        </Button>
    );
}

export const TopBar: React.FC<TopBarProps> = ({
    view,
    setView,
    onOpenActions,
}) => {
    return (
        <div className="z-10 flex flex-wrap items-center gap-4 border-b border-content/10 bg-surface-secondary px-4 py-3">
            <h1 className="mr-auto text-lg font-bold text-content">PhotoStar</h1>
            <div className="flex flex-wrap gap-2">
                <ViewButton view="library" current={view} setView={setView} />
                <ViewButton view="people" current={view} setView={setView} />
                <ViewButton view="familyTree" current={view} setView={setView} />
                <ViewButton view="albums" current={view} setView={setView} />
            </div>
            <div className="border-l border-content/10 pl-4">
                <Button onClick={onOpenActions}>Actions</Button>
            </div>
        </div>
    );
};
