import { Home, Link2, Network, Search, Trash2, Unlink, Upload, User } from "lucide-react";
import type { Person as PhotoStarPerson } from "@contracts/core";
import { resolveImageUrl } from "@boundary/runtime/backend";
import type { GedcomData, Person } from "../../../services/gedcom/kinshipTypes";
import { getYearOnly } from "./familyTreeLayout";
import type { PersonLinks, TreeInfo } from "./familyTreeTypes";

type SidebarProps = {
  readonly deleteTree: () => void;
  readonly filteredPeople: Person[];
  readonly gedcomData: GedcomData | null;
  readonly homePersonId: string;
  readonly linksMap: PersonLinks;
  readonly onLink: (personId: string) => void;
  readonly onOpenUpload: () => void;
  readonly onSearch: (query: string) => void;
  readonly onSelectHome: (personId: string) => void;
  readonly onSelectTree: (treeId: string) => void;
  readonly onUnlink: (gedcomPersonId: string, photoStarPersonId: string) => void;
  readonly onViewPhotos: (personId: string, name: string) => void;
  readonly searchQuery: string;
  readonly selectedTreeId: string;
  readonly trees: TreeInfo[];
};

function TreeSelector(props: Pick<SidebarProps, "onSelectTree" | "selectedTreeId" | "trees">) {
  return (
    <select
      value={props.selectedTreeId}
      onChange={(event) => props.onSelectTree(event.target.value)}
      className="w-full p-2 rounded bg-surface border border-content/10 text-sm outline-none"
    >
      {props.trees.length === 0
        ? <option value="">No trees uploaded</option>
        : props.trees.map((tree) => (
          <option key={tree.id} value={tree.id}>
            {tree.filename} ({tree.version_label || "v1"})
          </option>
        ))}
    </select>
  );
}

function SidebarHeader(props: Pick<SidebarProps, "deleteTree" | "onOpenUpload" | "onSelectTree" | "selectedTreeId" | "trees">) {
  return (
    <div className="p-4 border-b border-content/10 flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-base flex items-center gap-2">
          <Network className="w-5 h-5 text-brand-accent" /> Family Tree
        </h3>
        <button onClick={props.onOpenUpload} className="text-xs bg-brand-accent hover:bg-brand-accent-hover text-white px-2 py-1 rounded flex items-center gap-1 border-none cursor-pointer">
          <Upload className="w-3.5 h-3.5" /> Upload
        </button>
      </div>
      <TreeSelector {...props} />
      {props.selectedTreeId && (
        <button onClick={props.deleteTree} className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 bg-transparent border-none cursor-pointer w-fit self-end font-medium">
          <Trash2 className="w-3.5 h-3.5" /> Delete Tree
        </button>
      )}
    </div>
  );
}

function LinkedPersonActions(props: {
  readonly gedcomPersonId: string;
  readonly link: PhotoStarPerson;
  readonly onUnlink: SidebarProps["onUnlink"];
  readonly onViewPhotos: SidebarProps["onViewPhotos"];
}) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => props.onViewPhotos(props.link.id, props.link.name || "Unknown")} className="bg-brand-accent/15 text-brand-accent hover:bg-brand-accent/30 text-xs px-2 py-0.5 rounded-full border-none cursor-pointer flex items-center gap-1" title="View linked PhotoStar photos">
        {props.link.cover_image
          ? <img src={resolveImageUrl(props.link.cover_image) || undefined} className="w-4 h-4 rounded-full object-cover shrink-0" alt="Avatar" />
          : <User className="w-3 h-3" />}
        <span className="font-bold">{props.link.face_count}</span>
      </button>
      <button onClick={() => props.onUnlink(props.gedcomPersonId, props.link.id)} className="p-1 text-content-secondary hover:text-red-500 rounded hover:bg-content/5 border-none cursor-pointer" title="Unlink PhotoStar profile">
        <Unlink className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function TreePersonRow(props: {
  readonly homePersonId: string;
  readonly link?: PhotoStarPerson;
  readonly onLink: SidebarProps["onLink"];
  readonly onSelectHome: SidebarProps["onSelectHome"];
  readonly onUnlink: SidebarProps["onUnlink"];
  readonly onViewPhotos: SidebarProps["onViewPhotos"];
  readonly person: Person;
}) {
  const isHome = props.person.id === props.homePersonId;
  return (
    <div className={`p-2 rounded-lg flex items-center justify-between transition-colors ${isHome ? "bg-brand-accent/20 border-l-4 border-brand-accent" : "hover:bg-content/5"}`}>
      <button type="button" onClick={() => props.onSelectHome(props.person.id)} className="flex flex-col w-full min-w-6 min-h-6 pr-2 bg-transparent border-none text-left cursor-pointer outline-none flex-1 text-content font-normal focus:outline-none">
        <span className="font-medium text-sm text-content truncate">{props.person.name}</span>
        <span className="text-xs text-content-secondary">
          {props.person.birthDate ? `* ${getYearOnly(props.person.birthDate)}` : ""} {props.person.deathDate ? `† ${getYearOnly(props.person.deathDate)}` : ""}
        </span>
      </button>
      <div className="flex items-center gap-1.5 shrink-0">
        {props.link
          ? <LinkedPersonActions {...props} gedcomPersonId={props.person.id} link={props.link} />
          : (
            <button onClick={() => props.onLink(props.person.id)} className="p-1 text-content-secondary hover:text-brand-accent rounded hover:bg-content/5 border-none cursor-pointer" title="Link to PhotoStar profile">
              <Link2 className="w-3.5 h-3.5" />
            </button>
          )}
      </div>
    </div>
  );
}

function TreePeopleList(props: SidebarProps) {
  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
      {props.filteredPeople.map((person) => (
        <TreePersonRow
          key={person.id}
          person={person}
          homePersonId={props.homePersonId}
          link={props.linksMap.get(person.id)}
          onLink={props.onLink}
          onSelectHome={props.onSelectHome}
          onUnlink={props.onUnlink}
          onViewPhotos={props.onViewPhotos}
        />
      ))}
    </div>
  );
}

function LoadedTreeSidebar(props: SidebarProps & { readonly gedcomData: GedcomData }) {
  const homePerson = props.gedcomData.people[props.homePersonId];
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-4 border-b border-content/10 flex flex-col gap-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-content-secondary absolute left-3 top-2.5" />
          <input type="text" placeholder="Search tree members..." value={props.searchQuery} onChange={(event) => props.onSearch(event.target.value)} className="w-full pl-9 pr-3 py-2 bg-surface text-sm border border-content/10 rounded-lg outline-none focus:border-brand-accent" />
        </div>
        {homePerson && (
          <div className="p-2.5 bg-brand-accent/5 border border-brand-accent/20 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <Home className="w-4 h-4 text-brand-accent shrink-0" />
              <div className="text-xs truncate">
                <span className="font-semibold text-content-secondary block">Home Person:</span>
                <span className="font-bold text-content text-sm">{homePerson.name}</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <TreePeopleList {...props} />
    </div>
  );
}

export function FamilyTreeSidebar(props: SidebarProps) {
  return (
    <div className="w-80 border-r border-content/10 flex flex-col min-h-0 bg-surface-secondary">
      <SidebarHeader {...props} />
      {props.gedcomData
        ? <LoadedTreeSidebar {...props} gedcomData={props.gedcomData} />
        : <div className="flex-1 flex items-center justify-center p-6 text-center text-content-secondary text-sm">Please select or upload a family tree.</div>}
    </div>
  );
}
