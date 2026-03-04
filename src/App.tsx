import { useState, useEffect } from 'react';
import './App.css';
import metadata from '../metadata.json';
import { TaskDrawer } from './components/jobs/TaskDrawer';
import { ActionPanel } from './components/ActionPanel';
import { SinglePhotoView } from './components/SinglePhotoView';
import { usePhotoLibrary } from './hooks/usePhotoLibrary';
import { usePersistedState } from './hooks/usePersistedState';
import { TopBar } from './components/TopBar';
import { LibraryView } from './components/LibraryView';
import { PeopleView } from './components/PeopleView';
import { DashboardView } from './components/DashboardView';
import { LoadingScreen } from './components/LoadingScreen';
import { PERSON_COLORS } from './types/core';

function App() {
  const {
    status,
    error,
    stats,
    assets,
    people,
    rejectedAssets,
    jobs, // from useJobManager via usePhotoLibrary
    systemJobs,
    folderHistory,
    isSystemPaused,
    actions,
    logs,
    filterStack
  } = usePhotoLibrary();

  // Persisted UI State
  const [view, setView] = usePersistedState<'library' | 'people' | 'dashboard'>('ps_view', 'library');
  const [selectedAssetId, setSelectedAssetId] = usePersistedState<string | null>('ps_selected_asset', null);
  const [showFaces, setShowFaces] = usePersistedState<boolean>('ps_show_faces', false);
  const [showActions, setShowActions] = useState(false);
  const [peopleSelectionCount, setPeopleSelectionCount] = useState(0);
  const [librarySelection, setLibrarySelection] = useState<Set<string>>(new Set());
  const [declusteredAssets, setDeclusteredAssets] = useState<Set<string>>(new Set());
  const [showRejected, setShowRejected] = useState(false);
  // Transient status-bar override (clears after timeout)
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const showTransientStatus = (msg: string, durationMs = 5000) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), durationMs);
  };

  // After assets load, validate the persisted selected asset still exists.
  // If not, gracefully fall back to library view.
  useEffect(() => {
    if (!selectedAssetId || assets.length === 0) return;
    const still = assets.find(a => a.id === selectedAssetId);
    if (!still) {
      setSelectedAssetId(null);
      showTransientStatus('ℹ️ Previously selected photo is no longer available.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);


  if (status.includes('Initializing')) {
    return <LoadingScreen status={status} />;
  }

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 0, background: '#000', color: '#eee' }}>

      {/* 1. Top Navigation Bar */}
      <TopBar
        view={view}
        setView={(newView) => {
          actions.clearFilters();
          setDeclusteredAssets(newView === 'library' ? new Set() : declusteredAssets);
          setLibrarySelection(new Set());
          setView(newView);
        }}
        onRefresh={() => {
          setDeclusteredAssets(new Set());
          setShowRejected(false);
          actions.getRejectedAssetsForPerson(null);
          actions.refreshLibrary();
          actions.refreshPeople();
        }}
        onOpenActions={() => setShowActions(true)}
        showFaces={showFaces}
        setShowFaces={setShowFaces}
      />

      {/* Active Filter Bar */}
      {view === 'library' && filterStack.length > 0 && (
        <div style={{ background: '#1e3a8a', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #1e40af' }}>
          <span style={{ fontWeight: 'bold' }}>Filtered:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {filterStack.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <span style={{ color: '#60a5fa' }}>➜</span>}
                <div style={{ background: '#2563eb', padding: '4px 10px', borderRadius: 16, fontSize: '0.9rem', fontWeight: 500, display: 'flex', gap: 6 }}>
                  {f.persons && f.persons.length > 0 ? (
                    <>
                      {f.type === 'person_any' && f.persons.length > 1 && <span>Any:</span>}
                      {f.type === 'person_all' && <span>All:</span>}
                      {f.type === 'person_only' && <span>Only:</span>}
                      {f.persons.map((p, pIdx) => (
                        <span key={p.id} style={{ borderBottom: `3px solid ${PERSON_COLORS[pIdx % PERSON_COLORS.length]}` }}>
                          {p.name}
                        </span>
                      ))}
                    </>
                  ) : (
                    <span>{f.description || f.type}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }} />

          {/* Library Multi-Select Actions */}
          {librarySelection.size > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginRight: '16px', borderRight: '1px solid #3b82f6', paddingRight: '16px' }}>
              <span style={{ fontSize: '0.85rem', color: '#93c5fd', fontWeight: 600 }}>{librarySelection.size} Selected</span>

              {/* Decluster button only appears when showing a single person filter */}
              {filterStack[filterStack.length - 1]?.type === 'person_any' && filterStack[filterStack.length - 1]?.personIds.length === 1 && (
                <button
                  onClick={() => {
                    const personId = filterStack[filterStack.length - 1].personIds[0];
                    Array.from(librarySelection).forEach(assetId => {
                      actions.isolatePersonAsset(assetId, personId);
                    });

                    setDeclusteredAssets(prev => {
                      const next = new Set(prev);
                      librarySelection.forEach(id => next.add(id));
                      return next;
                    });
                    setLibrarySelection(new Set());
                  }}
                  style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
                >
                  Decluster
                </button>
              )}

              <button
                onClick={() => setLibrarySelection(new Set())}
                style={{ background: '#3b82f6', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
              >
                Clear Selection
              </button>
            </div>
          )}

          {/* Show Rejected toggle — only when viewing a single person's gallery */}
          {filterStack[filterStack.length - 1]?.type === 'person_any' && filterStack[filterStack.length - 1]?.personIds.length === 1 && (
            <button
              onClick={() => {
                const personId = filterStack[filterStack.length - 1].personIds[0];
                if (!showRejected) {
                  actions.getRejectedAssetsForPerson(personId);
                } else {
                  actions.getRejectedAssetsForPerson(null);
                }
                setShowRejected(prev => !prev);
              }}
              style={{
                background: showRejected ? 'rgba(239,68,68,0.2)' : 'transparent',
                border: `1px solid ${showRejected ? '#ef4444' : '#3b82f6'}`,
                color: showRejected ? '#ef4444' : '#93c5fd',
                padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem'
              }}
            >
              {showRejected ? '🚫 Hide Rejected' : '🚫 Show Rejected'}
            </button>
          )}

          <button onClick={() => {
            if (filterStack.length <= 1) {
              setView('people');
              actions.clearFilters();
            } else {
              actions.popFilter();
            }
            setDeclusteredAssets(new Set());
            setLibrarySelection(new Set());
            setShowRejected(false);
            actions.getRejectedAssetsForPerson(null);
          }} style={{ background: 'transparent', border: '1px solid #60a5fa', color: '#fff', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Back</button>
          <button onClick={() => {
            actions.clearFilters();
            setView('people');
            setDeclusteredAssets(new Set());
            setLibrarySelection(new Set());
            setShowRejected(false);
            actions.getRejectedAssetsForPerson(null);
          }} style={{ background: 'transparent', border: 'none', color: '#93c5fd', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', textDecoration: 'underline' }}>Clear All</button>
        </div>
      )}

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
            assets={assets.filter(a => !!a.preview_path)}
            loading={status.includes('Initializing')}
            onAssetClick={setSelectedAssetId}
            selectedAssetId={selectedAssetId}
            activeFilter={filterStack.length > 0 ? filterStack[filterStack.length - 1] : undefined}
            showFaces={showFaces}
            onUntagAsset={(assetId, personId) => {
              actions.isolatePersonAsset(assetId, personId);
              setDeclusteredAssets(prev => new Set(prev).add(assetId));
            }}
            onSetSensitivity={actions.setSensitivity}
            librarySelection={librarySelection}
            onLibrarySelectionChange={setLibrarySelection}
            declusteredAssets={declusteredAssets}
            showRejected={showRejected}
            rejectedAssets={showRejected ? rejectedAssets : []}
          />
        )}
        {view === 'people' && (
          <PeopleView
            people={people}
            onFilter={(filter) => {
              actions.pushFilter(filter);
              setView('library');
              setPeopleSelectionCount(0);
            }}
            onSelectionChange={setPeopleSelectionCount}
            onRename={actions.renamePerson}
            onMerge={actions.mergePeople}
          />
        )}
        {view === 'dashboard' && (
          <DashboardView
            jobs={jobs}
            systemJobs={systemJobs}
            refreshSystemJobs={actions.refreshSystemJobs}
            isSystemPaused={isSystemPaused}
            onTogglePause={actions.toggleSystemPause}
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
          <span style={{ marginRight: 8, color: statusMessage ? '#60a5fa' : (status.toLowerCase().includes('error') ? 'red' : 'green') }}>●</span>
          <span style={{ color: statusMessage ? '#93c5fd' : undefined }}>{statusMessage ?? status}</span>
        </div>
        <div style={{ marginRight: 16 }}>
          {view === 'library' && librarySelection.size > 0 && <span>{librarySelection.size} Selected | </span>}
          {view === 'library' && filterStack.length > 0 && <span>{assets.filter(a => !!a.preview_path).length} Shown | </span>}
          {view === 'people' && peopleSelectionCount > 0 && <span>{peopleSelectionCount} Selected | </span>}
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
        onScanSensitive={actions.scanSensitive}
        onScanSensitiveAll={actions.scanSensitiveAll}
        onExtractAiMetadata={actions.extractAiMetadata}
        getSetting={actions.getSetting}
        setSetting={actions.setSetting}
        onRefresh={() => { actions.refreshLibrary(); actions.refreshPeople(); }}
        onResetFaces={actions.resetFaces}
        onResetAll={actions.resetLibrary}
        onStopScan={actions.stopScan}
        folderHistory={folderHistory}
      />

      {/* Photo Overlay */}
      {selectedAssetId && assets.some(a => a.id === selectedAssetId) && (
        <SinglePhotoView
          assets={assets}
          initialIndex={assets.findIndex(a => a.id === selectedAssetId)}
          onClose={() => setSelectedAssetId(null)}
          onPrioritize={actions.prioritizeAsset}
          onFaceClick={(personId, personName) => {
            actions.pushFilter({
              type: 'person_any',
              personIds: [personId],
              description: personName
            });
            setSelectedAssetId(null);
            setView('library');
          }}
          onIsolateFace={actions.isolateFace}
          onSetSensitivity={actions.setSensitivity}
          onExtractAiMetadata={actions.extractAiMetadata}
          onOpenSettings={() => {
            setSelectedAssetId(null);
            setShowActions(true);
          }}
          jobs={jobs}
        />
      )}

      <TaskDrawer jobs={jobs} />
    </div>
  );
}

export default App;

