import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button, Card } from '../Primitives';

type ToolRegion = 'controls' | 'preview';

type PhotoEditorToolBoundaryProps = {
    readonly children: ReactNode;
    readonly toolName: string;
    readonly region: ToolRegion;
};

type PhotoEditorToolBoundaryState = {
    readonly error: string | null;
};

function regionLabel(region: ToolRegion): string {
    return region === 'preview' ? 'preview' : 'controls';
}

export class PhotoEditorToolBoundary extends Component<PhotoEditorToolBoundaryProps, PhotoEditorToolBoundaryState> {
    state: PhotoEditorToolBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): PhotoEditorToolBoundaryState {
        return { error: error.message };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error(`Photo editor ${this.props.toolName} ${this.props.region} failed`, error, info);
    }

    private readonly retry = (): void => {
        this.setState({ error: null });
    };

    render(): ReactNode {
        if (!this.state.error) {return this.props.children;}
        const label = regionLabel(this.props.region);
        return <Card className="max-w-md" role="alert">
            <div className="flex items-center gap-2 text-content">
                <AlertTriangle aria-hidden="true" className="text-red-700 dark:text-red-300" size={20} />
                <h3 className="font-semibold">{this.props.toolName} {label} hit a problem</h3>
            </div>
            <p className="break-words text-sm text-content-secondary">{this.state.error}</p>
            <p className="text-xs text-content-secondary">Your edit stack is still available.</p>
            <Button type="button" variant="secondary" onClick={this.retry}>
                <RotateCcw aria-hidden="true" size={16} />Try this tool again
            </Button>
        </Card>;
    }
}
