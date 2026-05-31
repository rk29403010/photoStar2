import type React from 'react';
import { Button } from './Primitives';

type TopBarProps = {
    readonly view: 'library' | 'people' | 'dashboard' | 'albums' | 'reviews' | 'vocabulary' | 'workflows' | 'groupDiagnostics';
    readonly setView: (view: 'library' | 'people' | 'dashboard' | 'albums' | 'reviews' | 'vocabulary' | 'workflows' | 'groupDiagnostics') => void;
    readonly onOpenActions: () => void;
    readonly onOpenSettings: () => void;
    readonly showSettings: boolean;
}

type ViewType = TopBarProps['view'];

function formatViewLabel(view: ViewType) {
    return view === 'groupDiagnostics' ? 'Diagnostics' : view[0].toUpperCase() + view.slice(1);
}

function Icon({
    path,
}: {
    readonly path: string;
}) {
    return (
        <svg aria-hidden="true" viewBox="0 -960 960 960" className="h-4 w-4 fill-current">
            <path d={path} />
        </svg>
    );
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

function UtilityButton({
    label,
    active,
    iconPath,
    onClick,
}: {
    readonly label: string;
    readonly active: boolean;
    readonly iconPath: string;
    readonly onClick: () => void;
}) {
    return (
        <Button
            onClick={onClick}
            variant={active ? 'primary' : 'secondary'}
            className="px-3 py-1.5 text-sm font-medium"
        >
            <Icon path={iconPath} />
            <span>{label}</span>
        </Button>
    );
}

const SETTINGS_ICON_PATH = 'm370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z';
const WORKFLOW_ICON_PATH = 'M160-480v240-480 240Zm400 360q17 0 28.5-11.5T600-160q0-17-11.5-28.5T560-200q-17 0-28.5 11.5T520-160q0 17 11.5 28.5T560-120Zm240-400q17 0 28.5-11.5T840-560q0-17-11.5-28.5T800-600q-17 0-28.5 11.5T760-560q0 17 11.5 28.5T800-520Zm-560 0h200v-80H240v80Zm0 160h200v-80H240v80Zm-80 200q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720H160v480h200v80H160Zm315 85q-35-35-35-85 0-39 22.5-70t57.5-43v-127h240v-47q-35-12-57.5-43T680-560q0-50 35-85t85-35q50 0 85 35t35 85q0 39-22.5 70T840-447v127H600v47q35 12 57.5 43t22.5 70q0 50-35 85t-85 35q-50 0-85-35Z';

export const TopBar: React.FC<TopBarProps> = ({
    view,
    setView,
    onOpenActions,
    onOpenSettings,
    showSettings,
}) => {
    return (
        <div className="z-10 flex flex-wrap items-center gap-4 border-b border-content/10 bg-surface-secondary px-4 py-3">
            <h1 className="mr-auto text-lg font-bold text-content">
                PhotoStar
            </h1>

            <div className="flex flex-wrap gap-2">
                <ViewButton view="library" current={view} setView={setView} />
                <ViewButton view="people" current={view} setView={setView} />
                <ViewButton view="albums" current={view} setView={setView} />
                <ViewButton view="reviews" current={view} setView={setView} />
                <ViewButton view="vocabulary" current={view} setView={setView} />
                <ViewButton view="dashboard" current={view} setView={setView} />
            </div>

            <div className="flex items-center gap-2 border-l border-content/10 pl-4">
                <UtilityButton
                    label="Workflow"
                    active={view === 'workflows'}
                    iconPath={WORKFLOW_ICON_PATH}
                    onClick={() => setView('workflows')}
                />
                <UtilityButton
                    label="Settings"
                    active={showSettings}
                    iconPath={SETTINGS_ICON_PATH}
                    onClick={onOpenSettings}
                />
                <Button
                    onClick={onOpenActions}
                    className="ml-1"
                >
                    Actions
                </Button>
            </div>
        </div>
    );
};
