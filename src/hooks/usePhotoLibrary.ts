import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Command, Child } from '@tauri-apps/plugin-shell';
import { useJobManager } from './useJobManager';
import type { Asset, Person, LibraryStats } from '../types/core';
import type { BackgroundJob } from '../types/jobs';

export type FilterType = 'person_any' | 'person_all' | 'person_only';
export interface LibraryFilter {
    type: FilterType;
    personIds: string[];
    description?: string; // Optional human-readable description
    persons?: { id: string; name: string }[]; // Structured person data for legend
}

export function usePhotoLibrary() {
    const [status, setStatus] = useState('Initializing...');
    const [error, setError] = useState<string | null>(null);
    const [childProcess, setChildProcess] = useState<Child | null>(null);
    const { jobs, addJob, updateJobProgress, processEvent } = useJobManager();

    // Data State — pause persisted so backend is re-paused on reconnect
    const [isSystemPaused, setIsSystemPausedState] = useState<boolean>(() => {
        try { return JSON.parse(localStorage.getItem('ps_system_paused') ?? 'false'); } catch { return false; }
    });
    const setIsSystemPaused = (val: boolean) => {
        try { localStorage.setItem('ps_system_paused', JSON.stringify(val)); } catch { /* ignore */ }
        setIsSystemPausedState(val);
    };
    const [stats, setStats] = useState<LibraryStats | null>(null);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [people, setPeople] = useState<Person[]>([]);
    const [systemJobs, setSystemJobs] = useState<BackgroundJob[]>([]);
    const [folderHistory, setFolderHistory] = useState<{ path: string, last_scanned_at: string }[]>([]);
    const [rejectedAssets, setRejectedAssets] = useState<Asset[]>([]);

    // Filters
    const [filterStack, setFilterStackState] = useState<LibraryFilter[]>([]);
    const filterStackRef = useRef<LibraryFilter[]>([]);



    // Logs
    const [logs, setLogs] = useState<string[]>([]);
    const logRef = useRef<boolean>(false);

    const addLog = (msg: string) => {
        console.log('[LOG-LIB]', msg);
        setLogs(prev => {
            const newLogs = [...prev, msg];
            if (newLogs.length > 50) return newLogs.slice(-50);
            return newLogs;
        });
    };

    useEffect(() => {
        if (logRef.current) return;
        logRef.current = true;

        const handleBackendMessage = (line: string) => {
            try {
                const msg = JSON.parse(line);
                if (msg.status === 'ok') {
                    if (msg.data?.message === 'pong') {
                        addLog('Pong received');
                    } else if (msg.data?.isPaused !== undefined) {
                        setIsSystemPaused(msg.data.isPaused);
                    } else if (msg.data?.count !== undefined) {
                        setStats(msg.data);
                    } else if (msg.data?.assets && msg.id?.startsWith('rejected-assets-')) {
                        setRejectedAssets(msg.data.assets);
                    } else if (msg.data?.assets) {
                        setAssets(msg.data.assets);
                    } else if (msg.data?.people) {
                        setPeople(msg.data.people);
                    } else if (msg.data?.jobs) {
                        setSystemJobs(msg.data.jobs);
                    }
                    if (msg.data?.folderHistory) {
                        setFolderHistory(msg.data.folderHistory);
                    }
                } else if (msg.status === 'event') {
                    if (msg.id === 'event_stream') {
                        const event = msg.data;
                        console.log('[Frontend] Event received:', event.type, event); // DEBUG LOG
                        processEvent(event);

                        if (event.type === 'SystemPausedStateChanged') {
                            setIsSystemPaused(event.isPaused);
                        }

                        // Handle State Updates for Assets
                        if (event.type === 'MediaDiscovered') {
                            setStats(prev => ({ count: (prev?.count || 0) + 1 }));

                            // Add to assets list
                            const newAsset: Asset = {
                                id: event.mediaId,
                                original_path: event.filePath,
                                width: event.width,
                                height: event.height,
                                created_at: new Date().toISOString()
                            };
                            setAssets(prev => {
                                if (prev.some(a => a.id === newAsset.id)) return prev;
                                return [...prev, newAsset];
                            });
                        }

                        // Handle Previews
                        if (event.type === 'PreviewGenerated') {
                            console.warn(`[Frontend] Preview ready for ${event.mediaId}`);
                            setAssets(prev => prev.map(a => {
                                if (a.id === event.mediaId) {
                                    return { ...a, preview_path: event.path };
                                }
                                return a;
                            }));
                        }

                        // Handle Sensitivity Score updates
                        if (event.type === 'SensitivityScored') {
                            setAssets(prev => prev.map(a => {
                                if (a.id === event.mediaId) {
                                    return { ...a, sensitivity_score: event.score };
                                }
                                return a;
                            }));
                        }

                        // Handle Face Counts (Feedback)
                        if (event.type === 'FacesDetected') {
                            console.warn(`[Frontend] Faces detected for ${event.mediaId}: ${event.faceCount}`);
                            if (event.faceCount > 0) {
                                setStats(prev => ({
                                    count: prev?.count || 0,
                                    ...prev,
                                    processed_faces: (prev?.['processed_faces'] || 0) + event.faceCount
                                }));
                            }
                        }
                    } else {
                        updateJobProgress(msg.id, msg.data);
                    }
                } else {
                    // debug log for unknown messages
                }
            } catch {
                // ignore parse errors for partial lines
            }
        };

        const startConnection = async () => {
            const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

            if (!isTauri) {
                // WebSocket Mode (Chrome Dev)
                addLog('Browser env detected. Connecting via WebSocket...');
                const ws = new WebSocket('ws://localhost:5174');

                ws.onopen = async () => {
                    addLog('WebSocket connected.');
                    setStatus('Ready (WS)');
                    setError(null);

                    // Mock Child process for commands
                    setChildProcess({
                        write: async (msg: string) => ws.send(msg)
                    } as unknown as Child);

                    // Initial Ping & Fetch
                    ws.send(JSON.stringify({ id: '1', command: 'ping', payload: {} }) + '\n');
                    ws.send(JSON.stringify({ id: 'stats-init', command: 'get_stats', payload: {} }) + '\n');
                    const initialFilter = filterStackRef.current.length > 0 ? filterStackRef.current[filterStackRef.current.length - 1] : undefined;
                    ws.send(JSON.stringify({ id: 'assets-init', command: 'get_assets', payload: { limit: 1000, filter: initialFilter } }) + '\n');
                    ws.send(JSON.stringify({ id: 'people-init', command: 'get_people', payload: {} }) + '\n');

                    // Rehydrate pause state — if we were paused before, tell the backend immediately
                    const waspaused = localStorage.getItem('ps_system_paused') === 'true';
                    if (waspaused) {
                        ws.send(JSON.stringify({ id: 'rehydrate-pause', command: 'pause_jobs', payload: {} }) + '\n');
                    }
                };

                ws.onmessage = (event) => {
                    handleBackendMessage(event.data);
                };

                ws.onclose = () => {
                    setStatus('Error: Connection Lost');
                    setError('Lost connection to backend server. Please verify core is running (npm run dev:core).');
                    addLog('WebSocket closed');
                };

                ws.onerror = () => {
                    setStatus('WebSocket error');
                    setError('Failed to connect to backend on ws://localhost:5174. Please verify core is running (npm run dev:core).');
                    addLog(`WS Error`);
                };
                return;
            }

            // Tauri Mode
            try {
                addLog('Spawning sidecar...');
                const command = Command.sidecar('binaries/core');

                command.on('close', data => {
                    const msg = `Sidecar closed code ${data.code}`;
                    setStatus(msg);
                    setError(`Backend sidecar terminated with code ${data.code}.`);
                    addLog(msg);
                });
                command.on('error', err => {
                    const msg = `Sidecar error: ${err}`;
                    setStatus(msg);
                    setError(msg);
                    addLog(msg);
                });

                command.stdout.on('data', line => {
                    handleBackendMessage(line);
                });

                command.stderr.on('data', line => {
                    addLog(`CORE ERR: ${line}`);
                });

                const process = await command.spawn();
                setChildProcess(process);
                setStatus('Ready (Tauri)');
                setError(null);
                addLog('Sidecar spawned.');

                // Initial Ping & Fetch
                await process.write(JSON.stringify({ id: '1', command: 'ping', payload: {} }) + '\n');
                await process.write(JSON.stringify({ id: 'stats-init', command: 'get_stats', payload: {} }) + '\n');
                const initialFilter = filterStackRef.current.length > 0 ? filterStackRef.current[filterStackRef.current.length - 1] : undefined;
                await process.write(JSON.stringify({ id: 'assets-init', command: 'get_assets', payload: { limit: 1000, filter: initialFilter } }) + '\n');
                await process.write(JSON.stringify({ id: 'people-init', command: 'get_people', payload: {} }) + '\n');

                // Rehydrate pause state
                const wasPaused = localStorage.getItem('ps_system_paused') === 'true';
                if (wasPaused) {
                    await process.write(JSON.stringify({ id: 'rehydrate-pause', command: 'pause_jobs', payload: {} }) + '\n');
                }

            } catch (e) {
                const msg = `Failed to spawn: ${String(e)}`;
                setStatus(msg);
                setError(msg);
                addLog(msg);
            }
        };

        startConnection();
    }, [processEvent, updateJobProgress]); // Run once on mount

    // Commands (Memoized)
    const sendCommand = useCallback(async (command: string, payload: Record<string, unknown> = {}) => {
        if (!childProcess) {
            addLog('Cannot send command: Sidecar not ready');
            return;
        }
        const id = `${command}-${Date.now()}`;
        const msg = JSON.stringify({ id, command, payload });
        await childProcess.write(msg + '\n');
    }, [childProcess]);

    const lastScanId = useRef<string | null>(null);

    const stopScan = useCallback(async () => {
        if (lastScanId.current && childProcess) {
            addLog(`Aborting job ${lastScanId.current}`);
            await childProcess.write(JSON.stringify({
                id: 'cmd-abort',
                command: 'abort_job',
                payload: { jobId: lastScanId.current }
            }) + '\n');
        }
    }, [childProcess]);

    const scanLibrary = useCallback(async (path: string) => {
        setStatus(`Scanning: ${path}`);
        const jobId = 'scan-' + Date.now();
        lastScanId.current = jobId;
        if (childProcess) {
            await childProcess.write(JSON.stringify({
                id: jobId,
                command: 'scan_folder',
                payload: { path }
            }) + '\n');
        }
    }, [childProcess]);

    const generatePreviews = useCallback(async () => {
        const jobId = 'previews-' + Date.now();
        addJob(jobId, 'preview_generation', 'Generate Previews');
        if (childProcess) {
            await childProcess.write(JSON.stringify({
                id: jobId,
                command: 'generate_previews',
                payload: {}
            }) + '\n');
        }
    }, [childProcess, addJob]);

    const detectFaces = useCallback(async () => {
        const jobId = 'faces-' + Date.now();
        addJob(jobId, 'face_analysis', 'Detect Faces');
        if (childProcess) {
            await childProcess.write(JSON.stringify({
                id: jobId,
                command: 'detect_faces',
                payload: {}
            }) + '\n');
        }
    }, [childProcess, addJob]);

    const recogniseFaces = useCallback(async () => {
        const jobId = 'recog-' + Date.now();
        addJob(jobId, 'face_analysis', 'Recognise Faces');
        if (childProcess) {
            await childProcess.write(JSON.stringify({
                id: jobId,
                command: 'recognise_faces',
                payload: {}
            }) + '\n');
        }
    }, [childProcess, addJob]);

    const clusterFaces = useCallback(async () => {
        const jobId = 'cluster-' + Date.now();
        addJob(jobId, 'similarity_cluster', 'Cluster Faces');
        if (childProcess) {
            await childProcess.write(JSON.stringify({
                id: jobId,
                command: 'cluster_faces',
                payload: {}
            }) + '\n');
        }
    }, [childProcess, addJob]);

    const scanSensitive = useCallback(async () => {
        const jobId = 'sensitive-' + Date.now();
        addJob(jobId, 'sensitive_scan', 'Sensitive Content Scan');
        if (childProcess) {
            await childProcess.write(JSON.stringify({
                id: jobId,
                command: 'scan_sensitive',
                payload: {}
            }) + '\n');
        }
    }, [childProcess, addJob]);

    const scanSensitiveAll = useCallback(async () => {
        const jobId = 'sensitive-force-' + Date.now();
        addJob(jobId, 'sensitive_scan', 'Force Re-scan All (Sensitive)');
        if (childProcess) {
            await childProcess.write(JSON.stringify({
                id: jobId,
                command: 'scan_sensitive_force',
                payload: {}
            }) + '\n');
        }
    }, [childProcess, addJob]);

    const getSetting = useCallback((key: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            if (!childProcess) {
                reject(new Error('Sidecar not ready'));
                return;
            }
            const id = `get_setting_${key}_${Date.now()}`;
            const timeout = setTimeout(() => reject(new Error('Timeout getting setting')), 5000);

            const listener = (line: string) => {
                try {
                    const msg = JSON.parse(line);
                    if (msg.id === id && msg.status === 'ok') {
                        clearTimeout(timeout);
                        resolve(msg.data?.value || '');
                        const childStdout = (childProcess as unknown as { stdout?: { removeListener: (ev: string, l: unknown) => void, on: (ev: string, l: unknown) => void } }).stdout;
                        if (childStdout) childStdout.removeListener('data', listener);
                    } else if (msg.id === id && msg.status === 'error') {
                        clearTimeout(timeout);
                        reject(new Error(msg.error));
                        const childStdout = (childProcess as unknown as { stdout?: { removeListener: (ev: string, l: unknown) => void, on: (ev: string, l: unknown) => void } }).stdout;
                        if (childStdout) childStdout.removeListener('data', listener);
                    }
                } catch {
                    // Ignore parse errors from partial chunks
                }
            };
            const childStdout = (childProcess as unknown as { stdout?: { removeListener: (ev: string, l: unknown) => void, on: (ev: string, l: unknown) => void } }).stdout;
            if (childStdout) childStdout.on('data', listener);
            childProcess.write(JSON.stringify({ id, command: 'get_setting', payload: { key } }) + '\n').catch(reject);
        });
    }, [childProcess]);

    const extractAiMetadata = useCallback(async (mediaId?: string) => {
        // Validate API Key First
        const apiKey = await getSetting('gemini_api_key').catch(() => '');
        if (!apiKey || apiKey.trim() === '') {
            throw new Error("MISSING_API_KEY");
        }

        const jobId = 'ai_meta-' + Date.now();
        addJob(jobId, 'ai_metadata', 'Extract AI Metadata');
        if (childProcess) {
            await childProcess.write(JSON.stringify({
                id: jobId,
                command: 'extract_ai_metadata',
                payload: mediaId ? { mediaId } : {}
            }) + '\n');
        }
        return jobId;
    }, [childProcess, addJob, getSetting]);



    const setSetting = useCallback(async (key: string, value: string) => {
        if (childProcess) {
            await childProcess.write(JSON.stringify({
                id: `set_setting_${key}_${Date.now()}`,
                command: 'set_setting',
                payload: { key, value }
            }) + '\n');
        }
    }, [childProcess]);

    const setSensitivity = useCallback(async (assetId: string, status: string | null) => {
        if (childProcess) {
            await childProcess.write(JSON.stringify({
                id: `set-sensitivity-${Date.now()}`,
                command: 'set_sensitivity',
                payload: { assetId, status }
            }) + '\n');
            // Optimistic local update
            setAssets(prev => prev.map(a => a.id === assetId ? { ...a, sensitivity_status: status } : a));
        }
    }, [childProcess]);

    const refreshLibrary = useCallback(() => {
        sendCommand('get_stats');
        const stack = filterStackRef.current;
        const currentFilter = stack.length > 0 ? stack[stack.length - 1] : undefined;
        sendCommand('get_assets', { limit: 1000, filter: currentFilter });
    }, [sendCommand]);

    const updateFilterStack = useCallback((newStack: LibraryFilter[]) => {
        filterStackRef.current = newStack;
        setFilterStackState(newStack);
        if (childProcess || typeof window !== 'undefined') {
            refreshLibrary();
        }
    }, [childProcess, refreshLibrary]);

    const refreshPeople = useCallback(() => sendCommand('get_people'), [sendCommand]);

    const refreshSystemJobs = useCallback(() => sendCommand('get_system_jobs'), [sendCommand]);

    const resetFaces = useCallback(async () => {
        setStatus('Resetting faces...');
        await sendCommand('reset_faces');
        setTimeout(() => {
            refreshLibrary();
            refreshPeople();
            setStatus('Faces reset.');
        }, 1000);
    }, [sendCommand, refreshLibrary, refreshPeople]);

    const resetLibrary = useCallback(async () => {
        setAssets([]);
        setPeople([]);
        setStats({ count: 0 });
        setStatus('Resetting library...');

        await sendCommand('reset_library');

        setTimeout(() => {
            refreshLibrary();
            setStatus('Library reset.');
        }, 1000);
    }, [sendCommand, refreshLibrary]);

    const toggleSystemPause = useCallback(() => {
        if (isSystemPaused) {
            sendCommand('resume_jobs');
        } else {
            sendCommand('pause_jobs');
        }
    }, [isSystemPaused, sendCommand]);

    const actions = useMemo(() => ({
        toggleSystemPause,
        scanLibrary,
        stopScan,
        generatePreviews,
        detectFaces,
        recogniseFaces,
        clusterFaces,
        scanSensitive,
        scanSensitiveAll,
        extractAiMetadata,
        getSetting,
        setSetting,
        setSensitivity,
        refreshLibrary,
        refreshPeople,
        refreshSystemJobs,
        resetFaces,
        resetLibrary,
        prioritizeAsset: (mediaId: string) => {
            sendCommand('prioritize_asset_processing', { mediaId });
        },
        renamePerson: (personId: string, newName: string) => {
            sendCommand('rename_person', { personId, newName });
        },
        mergePeople: (personIds: string[], targetName: string) => {
            sendCommand('merge_people', { personIds, targetName });
        },
        isolateFace: (assetId: string, faceIndex: number) => {
            sendCommand('isolate_face', { assetId, faceIndex });
        },
        isolatePersonAsset: (assetId: string, personId: string) => {
            sendCommand('isolate_person_asset', { assetId, personId });
        },
        getRejectedAssetsForPerson: (personId: string | null) => {
            if (!personId) {
                setRejectedAssets([]);
                return;
            }
            const id = `rejected-assets-${Date.now()}`;
            // Send with a specific id prefix so the response handler routes correctly
            if (childProcess) {
                childProcess.write(JSON.stringify({ id, command: 'get_rejected_assets_for_person', payload: { personId } }) + '\n');
            }
        },
        updateAsset: (id: string, partial: Partial<Asset>) => {
            setAssets(prev => prev.map(a => a.id === id ? { ...a, ...partial } : a));
        },
        pushFilter: (filter: LibraryFilter) => {
            updateFilterStack([...filterStackRef.current, filter]);
        },
        popFilter: () => {
            if (filterStackRef.current.length > 0) {
                updateFilterStack(filterStackRef.current.slice(0, -1));
            }
        },
        clearFilters: () => {
            updateFilterStack([]);
        }
    }), [
        toggleSystemPause, scanLibrary, stopScan, generatePreviews, detectFaces, recogniseFaces,
        clusterFaces, scanSensitive, scanSensitiveAll, extractAiMetadata, getSetting, setSetting, setSensitivity, refreshLibrary, refreshPeople, refreshSystemJobs,
        resetFaces, resetLibrary, sendCommand, updateFilterStack, childProcess, setRejectedAssets
    ]);

    return {
        status,
        error,
        logs,
        isSystemPaused,
        stats,
        assets,
        people,
        rejectedAssets,
        jobs, // from useJobManager
        systemJobs,
        folderHistory,
        actions,
        filterStack
    };
}
