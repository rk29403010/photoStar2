import type React from 'react';
import type { WorkflowVisualiserTextSection } from '@contracts/workflowVisualiser';

type WorkflowTextTabProps = {
    readonly sections: WorkflowVisualiserTextSection[];
}

export const WorkflowTextTab: React.FC<WorkflowTextTabProps> = ({ sections }) => (
    <div className="grid gap-4 xl:grid-cols-2">
        {sections.map((section) => (
            <section key={section.id} className="rounded-2xl border border-content/10 bg-surface-secondary p-5">
                <div className="text-xs font-semibold uppercase tracking-widest text-content-secondary">{section.label}</div>
                <div className="mt-4 space-y-3">
                    {section.items.map((item) => (
                        <div key={item.id} className="rounded-lg border border-content/10 bg-surface px-3 py-3">
                            <div className="text-sm font-medium text-content">{item.label}</div>
                            {item.value ? <div className="mt-1 text-xs text-content-secondary">{item.value}</div> : null}
                        </div>
                    ))}
                </div>
            </section>
        ))}
    </div>
);
