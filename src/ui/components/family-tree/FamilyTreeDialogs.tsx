import { Link2, Search, Upload } from "lucide-react";
import type { Person as PhotoStarPerson } from "@contracts/core";
import { resolveImageUrl } from "@boundary/runtime/backend";
import type { GedcomData } from "../../../services/gedcom/kinshipTypes";
import type { TreeInfo } from "./familyTreeTypes";

function PersonCandidate(props: {
  readonly onSelect: (personId: string) => void;
  readonly person: PhotoStarPerson;
}) {
  return (
    <button type="button" onClick={() => props.onSelect(props.person.id)} className="w-full text-left p-2 rounded hover:bg-content/5 cursor-pointer flex items-center justify-between bg-transparent border-none text-content font-normal focus:outline-none">
      <div className="flex items-center gap-2">
        {props.person.cover_image
          ? <img src={resolveImageUrl(props.person.cover_image) || undefined} alt={props.person.name} className="w-7 h-7 rounded-full object-cover border border-content/10" />
          : <div className="w-7 h-7 rounded-full bg-content/5 flex items-center justify-center text-xs border border-content/10">👤</div>}
        <span className="font-semibold text-sm">{props.person.name}</span>
      </div>
      <span className="text-xs text-content-secondary font-bold bg-content/5 px-2 py-0.5 rounded-full">{props.person.face_count} photos</span>
    </button>
  );
}

export function LinkPersonDialog(props: {
  readonly candidates: PhotoStarPerson[];
  readonly data: GedcomData | null;
  readonly linkingPersonId: string | null;
  readonly onClose: () => void;
  readonly onLink: (personId: string) => void;
  readonly onSearch: (search: string) => void;
  readonly search: string;
}) {
  if (!props.linkingPersonId) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <dialog className="w-full max-w-md rounded-xl border border-content/10 bg-surface p-6 text-content shadow-2xl" open>
        <h3 className="text-lg font-bold mb-3 flex items-center gap-2"><Link2 className="w-5 h-5 text-brand-accent" /> Link Profile</h3>
        <p className="text-xs text-content-secondary mb-4">Select which PhotoStar person corresponds to <strong>{props.data?.people[props.linkingPersonId]?.name}</strong> in the family tree.</p>
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-content-secondary absolute left-3 top-2.5" />
          <input type="text" placeholder="Search PhotoStar people..." value={props.search} onChange={(event) => props.onSearch(event.target.value)} className="w-full pl-9 pr-3 py-2 bg-surface-secondary text-sm border border-content/10 rounded-lg outline-none" />
        </div>
        <div className="max-h-60 overflow-y-auto space-y-1 mb-4 font-sans">
          {props.candidates.map((person) => <PersonCandidate key={person.id} person={person} onSelect={props.onLink} />)}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={props.onClose} className="px-4 py-2 text-sm bg-surface-secondary hover:bg-content/5 rounded-lg border-none cursor-pointer">Cancel</button>
        </div>
      </dialog>
    </div>
  );
}

function TreeGroupOptions({ trees }: { readonly trees: TreeInfo[] }) {
  const groupIds = Array.from(new Set(trees.map((tree) => tree.tree_group_id)));
  return (
    <>{groupIds.map((groupId) => {
      const tree = trees.find((candidate) => candidate.tree_group_id === groupId);
      return <option key={groupId} value={groupId}>Add version to: {tree?.filename || "Existing tree"}</option>;
    })}</>
  );
}

export function UploadTreeDialog(props: {
  readonly content: string;
  readonly errorMessage: string | null;
  readonly filename: string;
  readonly onClose: () => void;
  readonly onSelectFile: (file: File | undefined) => void;
  readonly onSelectGroup: (groupId: string) => void;
  readonly onUpload: () => void;
  readonly open: boolean;
  readonly selectedGroup: string;
  readonly trees: TreeInfo[];
}) {
  if (!props.open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <dialog className="w-full max-w-lg rounded-xl border border-content/10 bg-surface p-6 text-content shadow-2xl" open>
        <h3 className="text-lg font-bold mb-3 flex items-center gap-2"><Upload className="w-5 h-5 text-brand-accent" /> Upload GEDCOM Family Tree</h3>
        {props.errorMessage && <div className="bg-red-500/10 border border-red-500/30 text-red-500 text-xs p-3 rounded-lg mb-3">{props.errorMessage}</div>}
        <div className="space-y-4">
          <div>
            <label htmlFor="gedcom-file" className="block text-xs font-semibold uppercase tracking-wider mb-1">Select GEDCOM File</label>
            <input id="gedcom-file" type="file" accept=".ged" onChange={(event) => props.onSelectFile(event.target.files?.[0])} className="w-full p-2 bg-surface-secondary text-sm border border-content/10 rounded-lg outline-none" />
          </div>
          <div>
            <label htmlFor="tree-group-select" className="block text-xs font-semibold uppercase tracking-wider mb-1">Tree Group (optional versioning)</label>
            <select id="tree-group-select" value={props.selectedGroup} onChange={(event) => props.onSelectGroup(event.target.value)} className="w-full p-2 bg-surface-secondary text-sm border border-content/10 rounded-lg outline-none">
              <option value="">Start a new tree group</option><TreeGroupOptions trees={props.trees} />
            </select>
          </div>
          {props.filename && <div className="text-sm text-content-secondary">Selected file: <span className="font-medium">{props.filename}</span></div>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={props.onClose} className="px-4 py-2 text-sm bg-surface-secondary hover:bg-content/5 rounded-lg border-none cursor-pointer">Cancel</button>
          <button onClick={props.onUpload} disabled={!props.content || !props.filename} className="px-4 py-2 text-sm bg-brand-accent hover:bg-brand-accent-hover text-white rounded-lg border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-bold">Upload & Parse</button>
        </div>
      </dialog>
    </div>
  );
}
