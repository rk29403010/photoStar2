import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Command, Child } from '@tauri-apps/plugin-shell';
import { useJobManager } from './useJobManager';
import type { Asset, Person, LibraryStats } from '../types/core';
import type { BackgroundJob } from '../types/jobs';

export function usePhotoLibrary() {
    const [status, setStatus] = useState('Initializing...');
    const [error, setError] = useState<string | null>(null);
    const [childProcess, setChildProcess] = useState<Child | null>(null);
    const { jobs, addJob, updateJobProgress, processEvent } = useJobManager();

    // Data State
    const [stats, setStats] = useState<LibraryStats | null>(null);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [people, setPeople] = useState<Person[]>([]);
    const [systemJobs, setSystemJobs] = useState<BackgroundJob[]>([]);
    const [folderHistory, setFolderHistory] = useState<{ path: string, last_scanned_at: string }[]>([]);

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
                    } else if (msg.data?.count !== undefined) {
                        setStats(msg.data);
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
                                return [newAsset, ...prev];
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
                    ws.send(JSON.stringify({ id: 'assets-init', command: 'get_assets', payload: { limit: 1000 } }) + '\n');
                    ws.send(JSON.stringify({ id: 'people-init', command: 'get_people', payload: {} }) + '\n');
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
                await process.write(JSON.stringify({ id: 'assets-init', command: 'get_assets', payload: { limit: 1000 } }) + '\n');
                await process.write(JSON.stringify({ id: 'people-init', command: 'get_people', payload: {} }) + '\n');

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
        addJob(jobId, 'bulk_ingest', 'Import Folder');
        if (childProcess) {
            await childProcess.write(JSON.stringify({
                id: jobId,
                command: 'scan_folder',
                payload: { path }
            }) + '\n');
        }
    }, [childProcess, addJob]);

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

    const refreshLibrary = useCallback(() => {
        sendCommand('get_stats');
        sendCommand('get_assets', { limit: 1000 });
    }, [sendCommand]);

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

    const actions = useMemo(() => ({
        scanLibrary,
        stopScan,
        generatePreviews,
        detectFaces,
        recogniseFaces,
        clusterFaces,
        refreshLibrary,
        refreshPeople,
        refreshSystemJobs,
        resetFaces,
        resetLibrary,
        updateAsset: (id: string, partial: Partial<Asset>) => {
            setAssets(prev => prev.map(a => a.id === id ? { ...a, ...partial } : a));
        }
    }), [
        scanLibrary, stopScan, generatePreviews, detectFaces, recogniseFaces,
        clusterFaces, refreshLibrary, refreshPeople, refreshSystemJobs,
        resetFaces, resetLibrary
    ]);

    return {
        status,
        error,
        logs,
        stats,
        assets,
        people,
        jobs, // from useJobManager
        systemJobs,
        folderHistory,
        actions
    };
}
