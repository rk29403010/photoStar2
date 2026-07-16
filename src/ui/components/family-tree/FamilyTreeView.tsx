import { useMemo, useState } from "react";
import type { Person as PhotoStarPerson } from "@contracts/core";
import type { LibraryFilter } from "@ui/hooks/usePhotoLibrary";
import type { AppView } from "@ui/hooks/useAppRuntimeUi";
import { calculateProximity } from "../../../services/gedcom/relationshipService";
import type { GedcomData, Person } from "../../../services/gedcom/kinshipTypes";
import { FamilyTreeWorkspace } from "./FamilyTreeCanvas";
import { LinkPersonDialog, UploadTreeDialog } from "./FamilyTreeDialogs";
import { FamilyTreeSidebar } from "./FamilyTreeSidebar";
import {
  useFamilyTreeData,
  useFamilyTreeLinking,
  useFamilyTreeUpload,
  useTreeViewport,
} from "./familyTreeHooks";
import { buildSvgLayout } from "./familyTreeLayout";
import type { FamilyTreeViewMode, PersonLinks } from "./familyTreeTypes";

type FamilyTreeViewProps = {
  readonly people: PhotoStarPerson[];
  readonly onFilter?: (filter: LibraryFilter) => void;
  readonly setView?: (view: AppView) => void;
};

function buildLinksMap(people: PhotoStarPerson[], selectedTreeId: string): PersonLinks {
  const links = new Map<string, PhotoStarPerson>();
  people.forEach((person) => {
    person.gedcom_links?.forEach((link) => {
      if (link.treeId === selectedTreeId) {
        links.set(link.personId, person);
      }
    });
  });
  return links;
}

function filterPeople(data: GedcomData | null, query: string): Person[] {
  if (!data) {
    return [];
  }
  const people = Object.values(data.people);
  if (!query) {
    return people;
  }
  const normalized = query.toLowerCase();
  return people.filter((person) =>
    person.name.toLowerCase().includes(normalized) || person.id.toLowerCase().includes(normalized),
  );
}

function useFamilyTreeController(props: FamilyTreeViewProps) {
  const tree = useFamilyTreeData();
  const upload = useFamilyTreeUpload(tree.loadTrees);
  const linking = useFamilyTreeLinking(props.people, tree.selectedTreeId);
  const viewport = useTreeViewport();
  const [viewMode, setViewMode] = useState<FamilyTreeViewMode>("traditional");
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const linksMap = useMemo(
    () => buildLinksMap(props.people, tree.selectedTreeId),
    [props.people, tree.selectedTreeId],
  );
  const filteredPeople = useMemo(
    () => filterPeople(tree.gedcomData, searchQuery),
    [tree.gedcomData, searchQuery],
  );
  const proximityAnalysis = useMemo(
    () => tree.gedcomData && tree.homePersonId
      ? calculateProximity(tree.gedcomData, tree.homePersonId)
      : null,
    [tree.gedcomData, tree.homePersonId],
  );
  const layout = useMemo(
    () => buildSvgLayout(tree.gedcomData, tree.homePersonId, viewMode),
    [tree.gedcomData, tree.homePersonId, viewMode],
  );
  const viewPhotos = (personId: string, name: string) => {
    if (props.onFilter && props.setView) {
      props.setView("library");
      props.onFilter({ type: "person_any", personIds: [personId], description: name, persons: [{ id: personId, name }] });
    }
  };
  return {
    filteredPeople, hoveredNode, layout, linking, linksMap, proximityAnalysis,
    searchQuery, setHoveredNode, setSearchQuery, setViewMode, tree, upload,
    viewMode, viewPhotos, viewport,
  };
}

type Controller = ReturnType<typeof useFamilyTreeController>;

function FamilyTreeScreen({ controller }: { readonly controller: Controller }) {
  const { tree, upload, linking } = controller;
  return (
    <div className="flex flex-1 overflow-hidden bg-surface text-content min-h-0 flex-row">
      <FamilyTreeSidebar
        deleteTree={tree.deleteTree}
        filteredPeople={controller.filteredPeople}
        gedcomData={tree.gedcomData}
        homePersonId={tree.homePersonId}
        linksMap={controller.linksMap}
        onLink={linking.open}
        onOpenUpload={upload.open}
        onSearch={controller.setSearchQuery}
        onSelectHome={tree.selectHome}
        onSelectTree={tree.setSelectedTreeId}
        onUnlink={linking.unlink}
        onViewPhotos={controller.viewPhotos}
        searchQuery={controller.searchQuery}
        selectedTreeId={tree.selectedTreeId}
        trees={tree.trees}
      />
      <FamilyTreeWorkspace
        gedcomData={tree.gedcomData}
        homePersonId={tree.homePersonId}
        hoveredNode={controller.hoveredNode}
        layout={controller.layout}
        linksMap={controller.linksMap}
        onHover={controller.setHoveredNode}
        onLink={linking.open}
        onSelectHome={tree.selectHome}
        onViewPhotos={controller.viewPhotos}
        proximityAnalysis={controller.proximityAnalysis}
        setViewMode={controller.setViewMode}
        viewMode={controller.viewMode}
        viewport={controller.viewport}
      />
      <LinkPersonDialog candidates={linking.candidates} data={tree.gedcomData} linkingPersonId={linking.linkingGedcomId} onClose={linking.close} onLink={linking.link} onSearch={linking.setSearch} search={linking.search} />
      <UploadTreeDialog content={upload.uploadContent} errorMessage={upload.errorMessage} filename={upload.uploadFilename} onClose={upload.close} onSelectFile={upload.selectFile} onSelectGroup={upload.setSelectedGroup} onUpload={upload.upload} open={upload.showUploadModal} selectedGroup={upload.selectedGroup} trees={tree.trees} />
    </div>
  );
}

export function FamilyTreeView(props: FamilyTreeViewProps) {
  return <FamilyTreeScreen controller={useFamilyTreeController(props)} />;
}
