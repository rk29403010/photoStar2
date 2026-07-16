import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Person as PhotoStarPerson } from "@contracts/core";
import { globalRequest } from "@ui/hooks/usePhotoLibrary";
import { parseGedcom } from "../../../services/gedcom/gedcomParser";
import type { GedcomData } from "../../../services/gedcom/kinshipTypes";
import type { TreeInfo } from "./familyTreeTypes";

async function requestTrees(): Promise<TreeInfo[]> {
  if (!globalRequest) {
    return [];
  }
  const response = await globalRequest<{ trees: TreeInfo[] }>({
    idPrefix: "get_family_trees",
    command: "get_family_trees",
    payload: {},
    select: (data) => data as { trees: TreeInfo[] },
  });
  return response.trees ?? [];
}

function defaultTreeId(trees: TreeInfo[]): string {
  const saved = localStorage.getItem("ps_default_gedcom_tree_id");
  return trees.find((tree) => tree.id === saved)?.id ?? trees[0]?.id ?? "";
}

async function requestTreeContent(treeId: string): Promise<GedcomData> {
  if (!globalRequest) {
    return { people: {}, families: {} };
  }
  const response = await globalRequest<{ content: string; filename: string }>({
    idPrefix: "get_family_tree_content",
    command: "get_family_tree_content",
    payload: { treeId },
    select: (data) => data as { content: string; filename: string },
  });
  return parseGedcom(response.content);
}

function restoredHomePerson(treeId: string, data: GedcomData): string {
  const saved = localStorage.getItem(`ps_home_person_${treeId}`);
  return saved && data.people[saved] ? saved : (Object.keys(data.people)[0] ?? "");
}

function useTreeList() {
  const [trees, setTrees] = useState<TreeInfo[]>([]);
  const [selectedTreeId, setSelectedTreeId] = useState("");
  const loadTrees = useCallback(async () => {
    try {
      const loaded = await requestTrees();
      setTrees(loaded);
      if (loaded.length > 0) {
        setSelectedTreeId(defaultTreeId(loaded));
      }
    } catch (error) {
      console.error("Failed to load trees:", error);
    }
  }, []);

  useEffect(() => {
    void loadTrees();
  }, [loadTrees]);
  return { loadTrees, selectedTreeId, setSelectedTreeId, trees };
}

function useTreeContent(selectedTreeId: string) {
  const [gedcomData, setGedcomData] = useState<GedcomData | null>(null);
  const [homePersonId, setHomePersonId] = useState("");
  useEffect(() => {
    if (!selectedTreeId || !globalRequest) {
      setGedcomData(null);
      return;
    }
    void requestTreeContent(selectedTreeId)
      .then((data) => {
        localStorage.setItem("ps_default_gedcom_tree_id", selectedTreeId);
        setGedcomData(data);
        setHomePersonId(restoredHomePerson(selectedTreeId, data));
      })
      .catch((error: unknown) => console.error("Failed to load tree content:", error));
  }, [selectedTreeId]);

  useEffect(() => {
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent<{ treeId: string; personId: string }>).detail;
      if (detail) {
        setHomePersonId(detail.personId);
      }
    };
    globalThis.addEventListener("navigate-to-tree", navigate);
    return () => globalThis.removeEventListener("navigate-to-tree", navigate);
  }, []);

  const selectHome = async (id: string) => {
    setHomePersonId(id);
    if (!selectedTreeId) {
      return;
    }
    localStorage.setItem(`ps_home_person_${selectedTreeId}`, id);
    if (!globalRequest) {
      return;
    }
    try {
      await globalRequest<void>({
        idPrefix: "set_home_person",
        command: "set_home_person",
        payload: { treeId: selectedTreeId, homePersonId: id },
        select: (data) => data,
      });
    } catch (error) {
      console.error("Failed to persist home person:", error);
    }
  };
  return { gedcomData, homePersonId, selectHome, setGedcomData, setHomePersonId };
}

async function deleteTree(params: {
  readonly loadTrees: () => Promise<void>;
  readonly selectedTreeId: string;
  readonly setGedcomData: (data: GedcomData | null) => void;
  readonly setSelectedTreeId: (id: string) => void;
}): Promise<void> {
  const { selectedTreeId } = params;
    if (!selectedTreeId || !globalRequest) {
      return;
    }
    const confirmed = globalThis.confirm(
      "Are you sure you want to delete this family tree? This will also remove links to PhotoStar people.",
    );
    if (!confirmed) {
      return;
    }
    try {
      await globalRequest({
        idPrefix: "delete_family_tree",
        command: "delete_family_tree",
        payload: { treeId: selectedTreeId },
        select: (data) => data,
      });
      params.setSelectedTreeId("");
      params.setGedcomData(null);
      await params.loadTrees();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
}

export function useFamilyTreeData() {
  const list = useTreeList();
  const content = useTreeContent(list.selectedTreeId);
  const setSelectedTreeId = list.setSelectedTreeId;
  useEffect(() => {
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent<{ treeId: string }>).detail;
      if (detail) {
        setSelectedTreeId(detail.treeId);
      }
    };
    globalThis.addEventListener("navigate-to-tree", navigate);
    return () => globalThis.removeEventListener("navigate-to-tree", navigate);
  }, [setSelectedTreeId]);
  return {
    deleteTree: () => deleteTree({
      loadTrees: list.loadTrees,
      selectedTreeId: list.selectedTreeId,
      setGedcomData: content.setGedcomData,
      setSelectedTreeId: list.setSelectedTreeId,
    }),
    gedcomData: content.gedcomData,
    homePersonId: content.homePersonId,
    loadTrees: list.loadTrees,
    selectHome: content.selectHome,
    selectedTreeId: list.selectedTreeId,
    setSelectedTreeId: list.setSelectedTreeId,
    trees: list.trees,
  };
}

export function useFamilyTreeUpload(loadTrees: () => Promise<void>) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFilename, setUploadFilename] = useState("");
  const [uploadContent, setUploadContent] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reset = () => {
    setUploadFilename("");
    setUploadContent("");
    setErrorMessage(null);
  };
  const close = () => {
    setShowUploadModal(false);
    reset();
  };
  const selectFile = (file: File | undefined) => {
    if (!file) {
      return;
    }
    void file.text()
      .then((content) => {
        setUploadFilename(file.name);
        setUploadContent(content);
      })
      .catch((error: unknown) => console.error(error));
  };
  const upload = async () => {
    if (!uploadContent || !uploadFilename || !globalRequest) {
      return;
    }
    try {
      setErrorMessage(null);
      await globalRequest({
        idPrefix: "upload_family_tree",
        command: "upload_family_tree",
        payload: {
          filename: uploadFilename,
          content: uploadContent,
          treeGroupId: selectedGroup || undefined,
        },
        select: (data) => data,
      });
      close();
      setSelectedGroup("");
      await loadTrees();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };
  return {
    close,
    errorMessage,
    open: () => setShowUploadModal(true),
    selectFile,
    selectedGroup,
    setSelectedGroup,
    showUploadModal,
    upload,
    uploadContent,
    uploadFilename,
  };
}

async function refreshPeople(): Promise<void> {
  if (globalRequest) {
    await globalRequest({
      idPrefix: "get_people",
      command: "get_people",
      payload: {},
      select: (data) => data,
    });
  }
  globalThis.dispatchEvent(new CustomEvent("refresh-people-list"));
}

function linkCandidates(
  people: PhotoStarPerson[],
  selectedTreeId: string,
  search: string,
): PhotoStarPerson[] {
  const unlinked = people.filter((person) =>
    !person.gedcom_links?.some((link) => link.treeId === selectedTreeId),
  );
  if (!search) {
    return unlinked;
  }
  const query = search.toLowerCase();
  return unlinked.filter((person) => person.name?.toLowerCase().includes(query));
}

async function linkPerson(params: {
  readonly gedcomPersonId: string;
  readonly photoStarPersonId: string;
  readonly selectedTreeId: string;
}): Promise<void> {
  if (!globalRequest) {
    return;
  }
  await globalRequest({
    idPrefix: "link_person_to_gedcom",
    command: "link_person_to_gedcom",
    payload: {
      personId: params.photoStarPersonId,
      gedcomTreeId: params.selectedTreeId,
      gedcomPersonId: params.gedcomPersonId,
    },
    select: (data) => data,
  });
}

async function unlinkPerson(params: {
  readonly gedcomPersonId: string;
  readonly photoStarPersonId: string;
  readonly selectedTreeId: string;
}): Promise<void> {
  if (!globalRequest) {
    return;
  }
  await globalRequest({
    idPrefix: "unlink_person_from_gedcom",
    command: "unlink_person_from_gedcom",
    payload: {
      personId: params.photoStarPersonId,
      gedcomTreeId: params.selectedTreeId,
      gedcomPersonId: params.gedcomPersonId,
    },
    select: (data) => data,
  });
}

async function performLink(params: {
  readonly close: () => void;
  readonly gedcomPersonId: string | null;
  readonly photoStarPersonId: string;
  readonly selectedTreeId: string;
}): Promise<void> {
  if (!params.gedcomPersonId || !params.selectedTreeId || !globalRequest) {
    return;
  }
  try {
    await linkPerson({
      gedcomPersonId: params.gedcomPersonId,
      photoStarPersonId: params.photoStarPersonId,
      selectedTreeId: params.selectedTreeId,
    });
    params.close();
    await refreshPeople();
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  }
}

async function performUnlink(params: {
  readonly gedcomPersonId: string;
  readonly photoStarPersonId: string;
  readonly selectedTreeId: string;
}): Promise<void> {
  const confirmed = globalThis.confirm("Unlink this tree profile from the PhotoStar profile?");
  if (!params.selectedTreeId || !globalRequest || !confirmed) {
    return;
  }
  try {
    await unlinkPerson(params);
    await refreshPeople();
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  }
}

export function useFamilyTreeLinking(people: PhotoStarPerson[], selectedTreeId: string) {
  const [linkingGedcomId, setLinkingGedcomId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const candidates = useMemo(
    () => linkCandidates(people, selectedTreeId, search),
    [people, search, selectedTreeId],
  );
  const close = () => {
    setLinkingGedcomId(null);
    setSearch("");
  };
  const link = (photoStarPersonId: string) => performLink({
    close,
    gedcomPersonId: linkingGedcomId,
    photoStarPersonId,
    selectedTreeId,
  });
  const unlink = (gedcomPersonId: string, photoStarPersonId: string) =>
    performUnlink({ gedcomPersonId, photoStarPersonId, selectedTreeId });
  return { candidates, close, link, linkingGedcomId, open: setLinkingGedcomId, search, setSearch, unlink };
}

export function useTreeViewport() {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const mouseDown = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.tagName === "button" || target.closest("button")) {
      return;
    }
    setIsDragging(true);
    dragStart.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
  };
  const mouseMove = (event: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: event.clientX - dragStart.current.x, y: event.clientY - dragStart.current.y });
    }
  };
  return {
    mouseDown,
    mouseMove,
    mouseUp: () => setIsDragging(false),
    pan,
    reset: () => { setZoom(1); setPan({ x: 0, y: 0 }); },
    zoom,
    zoomBy: (factor: number) => setZoom((current) => Math.min(Math.max(current * factor, 0.2), 3)),
  };
}
