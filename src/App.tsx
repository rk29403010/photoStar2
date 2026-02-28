import { useState } from 'react';
import './App.css';
import metadata from '../metadata.json';
import { TaskDrawer } from './components/jobs/TaskDrawer';
import { ActionPanel } from './components/ActionPanel';
import { SinglePhotoView } from './components/SinglePhotoView';
import { usePhotoLibrary } from './hooks/usePhotoLibrary';
import { TopBar } from './components/TopBar';
import { LibraryView } from './components/LibraryView';
import { PeopleView } from './components/PeopleView';
import { DashboardView } from './components/DashboardView';
import { LoadingScreen } from './components/LoadingScreen';

function App() {
  const {
    status,
    error,
    stats,
    assets,
    people,
    jobs, // from useJobManager via usePhotoLibrary
    systemJobs,
    folderHistory,
    actions,
    logs
  } = usePhotoLibrary();

  // Local UI State
  const [view, setView] = useState<'library' | 'people' | 'dashboard'>('library');
  const [showActions, setShowActions] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);



  if (status.includes('Initializing')) {
    return <LoadingScreen status={status} />;
  }

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 0, background: '#000', color: '#eee' }}>

      {/* 1. Top Navigation Bar */}
      <TopBar
        view={view}
        setView={setView}
        onRefresh={() => { actions.refreshLibrary(); actions.refreshPeople(); }}
        onOpenActions={() => setShowActions(true)}
      />

      {error && (
        <div style={{
          background: 'rgba(255, 68, 68, 0.1)',
          borderBottom: '1px solid #ff4444',
          color: '#ff4444',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontWeight: '500',
          zIndex: 100
        }}>
          <span>⚠️ {error}</span>
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#ff4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* 2. Main Content Area */}
      <div style={{ flex: 1, minHeight: '0', position: 'relative' }}>
        {view === 'library' && (
          <LibraryView
            assets={assets}
            loading={status.includes('Initializing')}
            onAssetClick={setSelectedAssetId}
            selectedAssetId={selectedAssetId}
          />
        )}
        {view === 'people' && (
          <PeopleView people={people} />
        )}
        {view === 'dashboard' && (
          <DashboardView
            jobs={jobs}
            systemJobs={systemJobs}
            refreshSystemJobs={actions.refreshSystemJobs}
          />
        )}
      </div>

      {/* 3. Status Bar */}
      <div
        style={{
          height: '30px',
          background: '#1a1a1a',
          borderTop: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          fontSize: '12px',
          color: '#888',
          cursor: 'pointer',
          flexShrink: 0
        }}
        onClick={() => {
          console.log("Recent Logs:", logs.slice(-10));
          alert("Logs printed to console (F12)");
        }}
      >
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: 8, color: status.toLowerCase().includes('error') ? 'red' : 'green' }}>●</span>
          <span>{status}</span>
        </div>
        <div style={{ marginRight: 16 }}>
          {stats?.count || 0} Photos | {people.length} People
        </div>
        <div style={{ flexShrink: 0, opacity: 0.6 }}>
          v{metadata.version}
        </div>
      </div>

      {/* 4. Overlays */}
      <ActionPanel
        isOpen={showActions}
        onClose={() => setShowActions(false)}
        onScan={async (specificPath: string | undefined) => {
          if (specificPath) {
            actions.scanLibrary(specificPath);
            return;
          }

          const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

          if (isTauri) {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({ directory: true, multiple: false });
            if (selected && typeof selected === 'string') {
              actions.scanLibrary(selected);
            }
          } else {
            const path = window.prompt("Enter absolute path to scan (e.g. C:/Users/robin/Photos):");
            if (path) {
              actions.scanLibrary(path);
            }
          }
        }}
        onPreviews={actions.generatePreviews}
        onDetect={actions.detectFaces}
        onRecognise={actions.recogniseFaces}
        onCluster={actions.clusterFaces}
        onRefresh={() => { actions.refreshLibrary(); actions.refreshPeople(); }}
        onResetFaces={actions.resetFaces}
        onResetAll={actions.resetLibrary}
        onStopScan={actions.stopScan}
        folderHistory={folderHistory}
      />

      {/* Photo Overlay */}
      {selectedAssetId && (
        <SinglePhotoView
          assets={assets}
          initialIndex={Math.max(0, assets.findIndex(a => a.id === selectedAssetId))}
          onClose={() => setSelectedAssetId(null)}
        />
      )}

      <TaskDrawer jobs={jobs} />
    </div>
  );
}

export default App;

