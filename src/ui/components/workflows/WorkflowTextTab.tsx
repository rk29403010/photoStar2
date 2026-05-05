import type React from 'react';
import type { WorkflowVisualiserTextSection } from '@contracts/workflowVisualiser';

type WorkflowTextTabProps = {
    readonly sections: WorkflowVisualiserTextSection[];
}

export const WorkflowTextTab: React.FC<WorkflowTextTabProps> = ({ sections }) => (
    <div className="grid gap-4 xl:grid-cols-2">
        {sections.map((section) => (
            <section key={section.id} className="rounded-2xl border border-gray-800 bg-[#111111] p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">{section.label}</div>
                <div className="mt-4 space-y-3">
                    {section.items.map((item) => (
                        <div key={item.id} className="rounded-lg border border-gray-800 bg-[#0a0a0a] px-3 py-3">
                            <div className="text-sm font-medium text-gray-100">{item.label}</div>
                            {item.value ? <div className="mt-1 text-xs text-gray-400">{item.value}</div> : null}
                        </div>
                    ))}
                </div>
            </section>
        ))}
    </div>
);
