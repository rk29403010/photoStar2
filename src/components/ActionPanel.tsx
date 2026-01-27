import React, { useRef, useEffect } from 'react';

interface ActionPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onScan: () => void;
    onPreviews: () => void;
    onDetect: () => void;
    onRecognise: () => void;
    onCluster: () => void;
    onRefresh: () => void;
    onResetFaces: () => void;
    onResetAll: () => void;
}

export function ActionPanel({
    isOpen,
    onClose,
    onScan,
    onPreviews,
    onDetect,
    onRecognise,
    onCluster,
    onRefresh,
    onResetFaces,
    onResetAll,
}: ActionPanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
                onClose();
            }
        }
        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div
                ref={panelRef}
                className="bg-[#242424] border border-[#444] rounded-lg shadow-xl p-6 w-96 max-w-full text-white"
                role="dialog"
                aria-modal="true"
            >
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Actions</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        ✕
                    </button>
                </div>

                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Ingestion</h3>
                    <button onClick={() => { onScan(); onClose(); }} className="w-full text-left px-4 py-2 bg-[#333] hover:bg-[#444] rounded">
                        Import Folder
                    </button>

                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mt-4">Processing</h3>
                    <button onClick={() => { onPreviews(); onClose(); }} className="w-full text-left px-4 py-2 bg-[#333] hover:bg-[#444] rounded">
                        Generate Previews
                    </button>
                    <button onClick={() => { onDetect(); onClose(); }} className="w-full text-left px-4 py-2 bg-[#333] hover:bg-[#444] rounded">
                        Detect Faces
                    </button>
                    <button onClick={() => { onRecognise(); onClose(); }} className="w-full text-left px-4 py-2 bg-[#333] hover:bg-[#444] rounded">
                        Recognise Faces
                    </button>
                    <button onClick={() => { onCluster(); onClose(); }} className="w-full text-left px-4 py-2 bg-[#333] hover:bg-[#444] rounded">
                        Cluster Faces
                    </button>

                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mt-4">Maintenance</h3>
                    <button onClick={() => { onRefresh(); onClose(); }} className="w-full text-left px-4 py-2 bg-[#333] hover:bg-[#444] rounded">
                        Refresh Library
                    </button>

                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mt-4 text-red-400">Danger Zone</h3>
                    <button onClick={() => { onResetFaces(); onClose(); }} className="w-full text-left px-4 py-2 bg-red-900/50 hover:bg-red-800/50 rounded text-red-200">
                        Reset Faces
                    </button>
                    <button onClick={() => { onResetAll(); onClose(); }} className="w-full text-left px-4 py-2 bg-red-950/50 hover:bg-red-900/50 rounded text-red-200">
                        Reset All Data
                    </button>
                </div>
            </div>
        </div>
    );
}
