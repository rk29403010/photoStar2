import { useState, useEffect, useRef } from 'react';
import { Command } from '@tauri-apps/plugin-shell';
import { open } from '@tauri-apps/plugin-dialog';
import { VirtuosoGrid } from 'react-virtuoso';
import './App.css';
import { convertFileSrc } from '@tauri-apps/api/core';
import { TaskDrawer } from './components/jobs/TaskDrawer';
import { useJobManager } from './hooks/useJobManager';
import { usePipeline } from './hooks/usePipeline';
import { ActionPanel } from './components/ActionPanel';

function App() {
  const [status, setStatus] = useState('Initializing...');
  const [childProcess, setChildProcess] = useState<any>(null);

  const { jobs, addJob, updateJobProgress } = useJobManager();
  const [showActions, setShowActions] = useState(false);

  // Define action handlers ref so pipeline can use them
  // We need to wrap them in a stable object or useEffect

  // Forward declare handlers so we can pass them to pipeline
  // But since they are defined inside the component, we can just pass them directly if we order things right.
  // Actually, let's just define the pipeline AFTER the handlers are defined.

  const [stats, setStats] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [view, setView] = useState<'library' | 'people'>('library');

  // Debug logs state
  const [logs, setLogs] = useState<string[]>([]);
  const ran = useRef(false);

  const addLog = (msg: string) => {
    // console.log internal for safety
    console.log('[LOG-UI]', msg);
    setLogs(prev => {
      const newLogs = [...prev, msg];
      if (newLogs.length > 50) return newLogs.slice(-50);
      return newLogs;
    });
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const startSidecar = async () => {
      try {
        addLog('Spawning sidecar...');
        const command = Command.sidecar('binaries/core');

        command.on('close', data => {
          const msg = `Sidecar closed code ${data.code}`;
          setStatus(msg);
          addLog(msg);
        });
        command.on('error', error => {
          const msg = `Sidecar error: ${error}`;
          setStatus(msg);
          addLog(msg);
        });

        command.stdout.on('data', line => {
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
              }
            } else if (msg.status === 'event') {
              updateJobProgress(msg.id, msg.data);
            } else {
              addLog(`CORE: ${line}`);
            }
          } catch (e) {
            addLog(`CORE: ${line}`);
          }
        });

        command.stderr.on('data', line => {
          addLog(`CORE ERR: ${line}`);
        });

        const process = await command.spawn();
        setChildProcess(process);
        setStatus('Ready');
        addLog('Sidecar spawned.');

        // Initial Ping
        await process.write(JSON.stringify({ id: '1', command: 'ping', payload: {} }) + '\n');

        // Initial Fetch
        addLog('Fetching initial data...');
        await process.write(JSON.stringify({ id: 'stats-init', command: 'get_stats', payload: {} }) + '\n');
        await process.write(JSON.stringify({ id: 'assets-init', command: 'get_assets', payload: { limit: 1000 } }) + '\n');

      } catch (e: any) {
        const msg = `Failed to spawn: ${e.toString()}`;
        setStatus(msg);
        addLog(msg);
      }
    };

    startSidecar();
  }, []);

  const handleScan = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Photo Library Root'
      });

      if (selected && childProcess) {
        setStatus(`Scanning: ${selected}`);
        addLog(`Sending scan_folder for ${selected}`);
        const jobId = 'scan-' + Date.now();
        addJob(jobId, 'bulk_ingest', 'Import Folder');
        const msg = JSON.stringify({
          id: jobId,
          command: 'scan_folder',
          payload: { path: selected }
        });
        await childProcess.write(msg + '\n');
      }
    } catch (e) {
      console.error(e);
      addLog(`Error selecting folder: ${e}`);
    }
  };

  const handlePreviews = async () => {
    if (!childProcess) return;
    setStatus('Generating Previews...');
    addLog('Sending generate_previews');
    await childProcess.write(JSON.stringify({
      id: 'prev-' + Date.now(),
      command: 'generate_previews',
      payload: {}
    }) + '\n');
  };

  const handleDetectFaces = async () => {
    if (!childProcess) return;
    setStatus('Detecting Faces...');
    addLog('Sending detect_faces');
    const jobId = 'faces-' + Date.now();
    addJob(jobId, 'face_analysis', 'Detect Faces');
    await childProcess.write(JSON.stringify({
      id: jobId,
      command: 'detect_faces',
      payload: {}
    }) + '\n');
  };

  const handleRecogniseFaces = async () => {
    if (!childProcess) return;
    setStatus('Recognising Faces...');
    addLog('Sending recognise_faces');
    const jobId = 'recog-' + Date.now();
    addJob(jobId, 'face_analysis', 'Recognise Faces');
    await childProcess.write(JSON.stringify({
      id: jobId,
      command: 'recognise_faces',
      payload: {}
    }) + '\n');
  };

  const handleClusterFaces = async () => {
    if (!childProcess) return;
    setStatus('Clustering Faces...');
    addLog('Sending cluster_faces');
    const jobId = 'cluster-' + Date.now();
    addJob(jobId, 'similarity_cluster', 'Cluster Faces');
    await childProcess.write(JSON.stringify({
      id: jobId,
      command: 'cluster_faces',
      payload: {}
    }) + '\n');
  };

  const refreshStats = async () => {
    if (!childProcess) return;
    addLog('Refreshing stats...');
    await childProcess.write(JSON.stringify({ id: 'stats-' + Date.now(), command: 'get_stats', payload: {} }) + '\n');
    await childProcess.write(JSON.stringify({ id: 'assets-' + Date.now(), command: 'get_assets', payload: { limit: 1000 } }) + '\n');
  };

  const refreshPeople = async () => {
    if (!childProcess) return;
    addLog('Fetching people...');
    await childProcess.write(JSON.stringify({ id: 'people-' + Date.now(), command: 'get_people', payload: {} }) + '\n');
  };

  useEffect(() => {
    if (view === 'people') refreshPeople();
  }, [view]);

  const handleResetFaces = async () => {
    if (!childProcess) return;
    if (!confirm('Are you sure you want to clear face detection results?')) return;
    addLog('Resetting faces...');
    await childProcess.write(JSON.stringify({ id: 'reset-faces-' + Date.now(), command: 'reset_faces', payload: {} }) + '\n');
    setTimeout(refreshStats, 500);
  };

  const handleResetLibrary = async () => {
    if (!childProcess) return;
    if (!confirm('DANGER: This will wipe the ENTIRE library database. Are you sure?')) return;
    addLog('Resetting library...');
    await childProcess.write(JSON.stringify({ id: 'reset-lib-' + Date.now(), command: 'reset_library', payload: {} }) + '\n');
    setTimeout(refreshStats, 500);
  };

  // Automate pipeline
  usePipeline(jobs, {
    detectFaces: handleDetectFaces,
    recogniseFaces: handleRecogniseFaces,
    clusterFaces: handleClusterFaces
  });

  const ItemContent = (index: number) => {
    const asset = assets[index];
    if (!asset) return null;
    return <PhotoItem asset={asset} />;
  };

  const PersonItem = (index: number) => {
    const person = people[index];
    if (!person) return null;
    const coverSrc = person.cover_image ? convertFileSrc(person.cover_image) : null;

    return (
      <div style={{ width: '100%', height: '100%', background: '#222', padding: 5, overflow: 'hidden', color: '#fff' }}>
        <div style={{ width: '100%', height: '120px', background: '#333', marginBottom: 5 }}>
          {coverSrc && <img src={coverSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <div style={{ fontWeight: 'bold' }}>{person.name}</div>
        <div style={{ fontSize: '0.8em', color: '#aaa' }}>{person.face_count} faces</div>
      </div>
    );
  };

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 0 }}>
      {/* Header / Controls */}
      {/* Header / Controls */}
      <div style={{ marginBottom: 10, padding: 5, borderBottom: '1px solid #444', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setShowActions(true)} style={{ fontWeight: 'bold' }}>⚙ Actions</button>

        <div style={{ borderLeft: '1px solid #666', height: 20, margin: '0 5px' }}></div>

        <button onClick={() => setView('library')} disabled={view === 'library'}>Library</button>
        <button onClick={() => setView('people')} disabled={view === 'people'}>People</button>
        <button onClick={refreshPeople} style={{ fontSize: '0.8em' }}>↻ People</button>
      </div>

      <ActionPanel
        isOpen={showActions}
        onClose={() => setShowActions(false)}
        onScan={handleScan}
        onPreviews={handlePreviews}
        onDetect={handleDetectFaces}
        onRecognise={handleRecogniseFaces}
        onCluster={handleClusterFaces}
        onRefresh={() => { refreshStats(); refreshPeople(); }}
        onResetFaces={handleResetFaces}
        onResetAll={handleResetLibrary}
      />

      {/* Grid Area */}
      <div style={{ flex: 1, minHeight: '0' }}>
        {view === 'library' && assets.length > 0 && (
          <VirtuosoGrid
            style={{ height: '100%' }}
            totalCount={assets.length}
            listClassName="photo-grid"
            itemContent={ItemContent}
          />
        )}

        {view === 'people' && people.length > 0 && (
          <VirtuosoGrid
            style={{ height: '100%' }}
            totalCount={people.length}
            listClassName="photo-grid"
            itemContent={PersonItem}
          />
        )}

        {assets.length === 0 && people.length === 0 && <div style={{ padding: 20 }}>No content. Import text and click Refresh.</div>}
      </div>

      {/* Status Bar */}
      <div
        style={{
          height: '30px',
          background: '#222',
          borderTop: '1px solid #444',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          fontSize: '12px',
          color: '#ccc',
          cursor: 'pointer'
        }}
        onClick={() => {
          console.log("Status bar clicked. showing visible logs:");
          console.table(logs.slice(-10));
          alert("Use F12 or Right Click > Inspect Element to view full logs.");
        }}
      >
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          {status.toLowerCase().includes('error') || status.toLowerCase().includes('failed') ? (
            <span style={{ color: 'red', marginRight: 5, fontWeight: 'bold' }}>❌</span>
          ) : (
            <span style={{ color: 'green', marginRight: 5 }}>ℹ️</span>
          )}
          <span>{status}</span>
          <span>{status}</span>
        </div>
        <div>
          Assets: {stats?.count || 0} | People: {people.length}
        </div>
      </div>
      <TaskDrawer jobs={jobs} />
    </div >
  );
}

function PhotoItem({ asset }: { asset: any }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setRect({ w: width, h: height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const imgSrc = asset.preview_path ? convertFileSrc(asset.preview_path) : null;

  // Calculate rendered image position
  let imgStyle: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'contain' };
  let overlayStyle: React.CSSProperties = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' };

  // If we have dimensions, we can calculate the exact "contain" rect
  if (asset.width && asset.height && rect.w > 0 && rect.h > 0) {
    const scale = Math.min(rect.w / asset.width, rect.h / asset.height);
    const renderW = asset.width * scale;
    const renderH = asset.height * scale;
    const offsetX = (rect.w - renderW) / 2;
    const offsetY = (rect.h - renderH) / 2;

    // Make the overlay match the rendered image exactly
    overlayStyle = {
      position: 'absolute',
      left: offsetX,
      top: offsetY,
      width: renderW,
      height: renderH,
      pointerEvents: 'none'
    };
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#222', overflow: 'hidden', position: 'relative' }}>
      {imgSrc && <img src={imgSrc} style={imgStyle} />}

      {/* Face Overlays Container */}
      <div style={overlayStyle}>
        {asset.faces && asset.faces.map((face: any, i: number) => {
          const hasEmbedding = asset.face_embeddings && asset.face_embeddings[i];
          const borderColor = hasEmbedding ? 'cyan' : 'rgba(0, 255, 0, 0.8)';
          const boxShadow = hasEmbedding ? '0 0 4px cyan' : '0 0 2px black';

          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${face.box[0] * 100}%`,
                top: `${face.box[1] * 100}%`,
                width: `${(face.box[2] - face.box[0]) * 100}%`,
                height: `${(face.box[3] - face.box[1]) * 100}%`,
                border: `2px solid ${borderColor}`,
                boxShadow: boxShadow
              }}
            />
          )
        })}
      </div>

      {!imgSrc && <div style={{ padding: 5, fontSize: 10, position: 'absolute', bottom: 0, color: '#fff' }}>{asset.id.slice(0, 4)}</div>}
    </div>
  );
}

export default App;
