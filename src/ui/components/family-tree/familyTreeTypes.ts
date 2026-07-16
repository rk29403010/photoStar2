import type { Person as PhotoStarPerson } from "@contracts/core";
import type { AnalysisResult, GedcomData } from "../../../services/gedcom/kinshipTypes";

export type FamilyTreeViewMode =
  | "traditional"
  | "horizontal"
  | "fan"
  | "list";

export type TreeInfo = {
  id: string;
  filename: string;
  file_hash: string;
  tree_group_id: string;
  version_label: string;
  created_at: string;
};

export type TreeNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  gender: string;
  level: number;
  isMain?: boolean;
  isHomePerson?: boolean;
};

export type TreeEdge = { source: string; target: string; type: string };
export type TreePath = { path: string; isBold: boolean; color: string };

export type FanArc = {
  id: string;
  path: string;
  fill: string;
  textTransform: string;
  fontSize: string;
  fontWeight: string;
  displayName: string;
  fullNameWithDates: string;
};

export type SvgLayoutResult = {
  nodes: TreeNode[];
  edges: TreeEdge[];
  customPaths?: TreePath[];
  fanArcs?: FanArc[];
};

export type PersonLinks = ReadonlyMap<string, PhotoStarPerson>;

export type FamilyTreeWorkspaceData = {
  gedcomData: GedcomData | null;
  homePersonId: string;
  layout: SvgLayoutResult | null;
  linksMap: PersonLinks;
  proximityAnalysis: AnalysisResult | null;
  viewMode: FamilyTreeViewMode;
};
