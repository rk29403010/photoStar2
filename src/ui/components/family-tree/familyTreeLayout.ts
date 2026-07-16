import * as d3 from "d3";
import type { Family, GedcomData, Person } from "../../../services/gedcom/kinshipTypes";
import type {
  FamilyTreeViewMode,
  FanArc,
  SvgLayoutResult,
  TreeNode,
  TreePath,
} from "./familyTreeTypes";

type TraditionalTreeNode = Person & {
  isHomePerson?: boolean;
  siblings: Person[];
  children?: TraditionalTreeNode[];
};

type BalancedTreeNode = Omit<Person, "fams"> & {
  isEmpty: boolean;
  children?: BalancedTreeNode[];
};

type TraditionalHierarchyNode = d3.HierarchyPointNode<TraditionalTreeNode>;
type FanHierarchyNode = d3.HierarchyRectangularNode<BalancedTreeNode>;

const BRAND_COLOR = "var(--color-brand-accent)";
const SECONDARY_COLOR = "var(--color-content-secondary)";

export function getYearOnly(date?: string): string {
  if (!date) {
    return "";
  }
  return /\d{4}/.exec(date)?.[0] ?? date;
}

function shortenNamePart(value: string): string {
  return value.length > 14 ? `${value.substring(0, 12)}..` : value;
}

export function formatName(name: string): { first: string; last: string } {
  const parts = name.replaceAll("/", "").trim().split(" ");
  if (parts.length === 1) {
    return { first: shortenNamePart(parts[0] ?? ""), last: "" };
  }
  const last = parts.pop() ?? "";
  return { first: shortenNamePart(parts.join(" ")), last: shortenNamePart(last) };
}

function childFamily(data: GedcomData, person: Person): Family | undefined {
  return person.famc ? data.families[person.famc] : undefined;
}

function familySiblings(data: GedcomData, family: Family, rootId: string): Person[] {
  return family.children
    .filter((childId) => childId !== rootId)
    .map((childId) => data.people[childId])
    .filter((person): person is Person => Boolean(person));
}

function buildParentNodes(
  data: GedcomData,
  family: Family | undefined,
  depth: number,
  maxDepth: number,
): TraditionalTreeNode[] {
  const parentIds = [family?.husb, family?.wife].filter(
    (id): id is string => Boolean(id),
  );
  return parentIds
    .map((id) => buildVerticalHierarchy(data, id, depth + 1, maxDepth))
    .filter((node): node is TraditionalTreeNode => Boolean(node));
}

function buildVerticalHierarchy(
  data: GedcomData,
  rootId: string,
  depth = 0,
  maxDepth = 6,
): TraditionalTreeNode | null {
  const person = data.people[rootId];
  if (depth > maxDepth || !person) {
    return null;
  }
  const family = childFamily(data, person);
  const children = buildParentNodes(data, family, depth, maxDepth);
  return {
    ...person,
    isHomePerson: depth === 0,
    siblings: family ? familySiblings(data, family, rootId) : [],
    ...(children.length > 0 ? { children } : {}),
  };
}

function balancedPerson(data: GedcomData, rootId: string | null, depth: number): BalancedTreeNode {
  const person = rootId ? data.people[rootId] : undefined;
  if (!person) {
    return { id: `empty-${depth}-${Math.random()}`, name: "", gender: "U", isEmpty: true };
  }
  return {
    id: person.id,
    name: person.name.replaceAll("/", "").trim(),
    gender: person.gender,
    birthDate: person.birthDate,
    deathDate: person.deathDate,
    famc: person.famc,
    isEmpty: false,
  };
}

function balancedParentIds(data: GedcomData, person: BalancedTreeNode): [string | null, string | null] {
  const family = person.famc ? data.families[person.famc] : undefined;
  return [family?.husb ?? null, family?.wife ?? null];
}

function buildBalancedHierarchy(
  data: GedcomData,
  rootId: string | null,
  depth = 0,
  maxDepth = 6,
): BalancedTreeNode {
  const node = balancedPerson(data, rootId, depth);
  if (depth >= maxDepth) {
    return node;
  }
  node.children = balancedParentIds(data, node).map((parentId) =>
    buildBalancedHierarchy(data, parentId, depth + 1, maxDepth),
  );
  return node;
}

function nodeSeparation(
  first: d3.HierarchyPointNode<TraditionalTreeNode>,
  second: d3.HierarchyPointNode<TraditionalTreeNode>,
): number {
  const firstRight = Math.ceil(first.data.siblings.length / 2);
  const secondLeft = Math.floor(second.data.siblings.length / 2);
  const base = first.parent === second.parent ? 1.25 : 2.5;
  return base + firstRight + secondLeft;
}

function siblingOffset(index: number): number {
  const direction = index % 2 === 0 ? 1 : -1;
  return Math.ceil((index + 1) / 2) * 160 * direction;
}

function addTraditionalNodes(nodes: Map<string, TreeNode>, node: TraditionalHierarchyNode): void {
  const currentX = node.x;
  const currentY = -node.y + 200;
  nodes.set(node.data.id, {
    id: node.data.id,
    name: node.data.name,
    x: currentX,
    y: currentY,
    gender: node.data.gender,
    level: node.depth,
    isMain: true,
    isHomePerson: node.data.isHomePerson,
  });
  node.data.siblings.forEach((sibling, index) => {
    nodes.set(sibling.id, {
      id: sibling.id,
      name: sibling.name,
      x: currentX + siblingOffset(index),
      y: currentY,
      gender: sibling.gender,
      level: node.depth,
      isMain: false,
    });
  });
}

function addParentJoinPaths(node: TraditionalHierarchyNode, paths: TreePath[], combY: number): number {
  const parents = node.children ?? [];
  const connectY = -parents[0].y + 200 + 84;
  if (parents.length === 1) {
    paths.push({ path: `M ${parents[0].x} ${-parents[0].y + 235} L ${parents[0].x} ${combY}`, isBold: true, color: BRAND_COLOR });
    return parents[0].x;
  }
  const midpoint = (parents[0].x + parents[1].x) / 2;
  paths.push(
    { path: `M ${parents[0].x} ${-parents[0].y + 235} L ${parents[0].x} ${connectY}`, isBold: true, color: BRAND_COLOR },
    { path: `M ${parents[1].x} ${-parents[1].y + 235} L ${parents[1].x} ${connectY}`, isBold: true, color: BRAND_COLOR },
    { path: `M ${parents[0].x} ${connectY} L ${parents[1].x} ${connectY}`, isBold: true, color: BRAND_COLOR },
    { path: `M ${midpoint} ${connectY} L ${midpoint} ${combY}`, isBold: true, color: BRAND_COLOR },
  );
  return midpoint;
}

function addCombPaths(node: TraditionalHierarchyNode, paths: TreePath[], parentMidpoint: number): void {
  const currentY = -node.y + 200;
  const combY = currentY - 50;
  const positions = [node.x, ...node.data.siblings.map((_, index) => node.x + siblingOffset(index))];
  const minX = Math.min(...positions);
  const maxX = Math.max(...positions);
  if (minX !== maxX) {
    paths.push({ path: `M ${minX} ${combY} L ${maxX} ${combY}`, isBold: false, color: SECONDARY_COLOR });
  }
  if (parentMidpoint !== node.x) {
    paths.push({ path: `M ${parentMidpoint} ${combY} L ${node.x} ${combY}`, isBold: true, color: BRAND_COLOR });
  }
  positions.forEach((x, index) => {
    paths.push({
      path: `M ${x} ${combY} L ${x} ${currentY - 35}`,
      isBold: index === 0,
      color: index === 0 ? BRAND_COLOR : SECONDARY_COLOR,
    });
  });
}

function addTraditionalPaths(node: TraditionalHierarchyNode, paths: TreePath[]): void {
  if (!node.children?.length) {
    return;
  }
  const combY = -node.y + 150;
  addCombPaths(node, paths, addParentJoinPaths(node, paths, combY));
}

function buildTraditionalLayout(data: GedcomData, homePersonId: string): SvgLayoutResult {
  const hierarchy = buildVerticalHierarchy(data, homePersonId);
  if (!hierarchy) {
    return { nodes: [], edges: [] };
  }
  const root = d3.tree<TraditionalTreeNode>()
    .nodeSize([160, 150])
    .separation(nodeSeparation)(d3.hierarchy(hierarchy));
  const nodes = new Map<string, TreeNode>();
  const customPaths: TreePath[] = [];
  root.descendants().forEach((node) => {
    addTraditionalNodes(nodes, node);
    addTraditionalPaths(node, customPaths);
  });
  return { nodes: Array.from(nodes.values()), edges: [], customPaths };
}

function addHorizontalNode(nodes: Map<string, TreeNode>, node: TraditionalHierarchyNode): void {
  nodes.set(node.data.id, {
    id: node.data.id,
    name: node.data.name,
    x: -node.y,
    y: node.x,
    gender: node.data.gender,
    level: node.depth,
    isMain: true,
    isHomePerson: node.data.isHomePerson,
  });
}

function horizontalParentPaths(node: TraditionalHierarchyNode): TreePath[] {
  return (node.children ?? []).flatMap((parent) => {
    const path = d3.linkHorizontal()({
      source: [-parent.y + 70, parent.x],
      target: [-node.y - 70, node.x],
    });
    return path ? [{ path, isBold: true, color: BRAND_COLOR }] : [];
  });
}

function buildHorizontalLayout(data: GedcomData, homePersonId: string): SvgLayoutResult {
  const hierarchy = buildVerticalHierarchy(data, homePersonId);
  if (!hierarchy) {
    return { nodes: [], edges: [] };
  }
  const root = d3.tree<TraditionalTreeNode>()
    .nodeSize([85, 220])(d3.hierarchy(hierarchy));
  const nodes = new Map<string, TreeNode>();
  const customPaths: TreePath[] = [];
  root.descendants().forEach((node) => {
    addHorizontalNode(nodes, node);
    customPaths.push(...horizontalParentPaths(node));
  });
  return { nodes: Array.from(nodes.values()), edges: [], customPaths };
}

function fanFill(node: FanHierarchyNode): string {
  if (node.depth === 0) {
    return "var(--color-surface-secondary)";
  }
  if (node.data.gender === "M") {
    return "rgba(59, 130, 246, 0.15)";
  }
  return node.data.gender === "F"
    ? "rgba(236, 72, 153, 0.15)"
    : "var(--color-surface-secondary)";
}

function fanTextTransform(node: FanHierarchyNode): string {
  if (node.depth === 0) {
    return "translate(0,0)";
  }
  const degrees = ((node.x0 + node.x1) / 2) * 180 / Math.PI;
  const radius = node.depth * 75 + 52.5;
  const inverse = degrees > 180 ? " rotate(180)" : "";
  return `rotate(${degrees - 90}) translate(${radius},0)${inverse}`;
}

function fanFont(node: FanHierarchyNode): { size: string; weight: string } {
  const sizes = ["12px", "11px", "10px", "9px", "8px"];
  return {
    size: sizes[node.depth] ?? "7px",
    weight: node.depth === 0 ? "bold" : "normal",
  };
}

function fanDisplayName(node: FanHierarchyNode): string {
  const source = node.depth > 3
    ? (node.data.name.split(" ").at(-1) ?? node.data.name)
    : node.data.name;
  return source.length > 18 ? `${source.substring(0, 16)}..` : source;
}

function fanFullName(node: FanHierarchyNode): string {
  const birth = getYearOnly(node.data.birthDate);
  const death = getYearOnly(node.data.deathDate);
  const lifespan = birth || death ? ` (${birth || "?"}-${death})` : "";
  return `${node.data.name}${lifespan}`;
}

function createFanArc(
  node: FanHierarchyNode,
  arcGenerator: d3.Arc<void, FanHierarchyNode>,
): FanArc | null {
  if (node.data.isEmpty) {
    return null;
  }
  const path = arcGenerator(node);
  if (!path) {
    return null;
  }
  const font = fanFont(node);
  return {
    id: node.data.id,
    path,
    fill: fanFill(node),
    textTransform: fanTextTransform(node),
    fontSize: font.size,
    fontWeight: font.weight,
    displayName: fanDisplayName(node),
    fullNameWithDates: fanFullName(node),
  };
}

function buildFanLayout(data: GedcomData, homePersonId: string): SvgLayoutResult {
  const hierarchy = d3.hierarchy(buildBalancedHierarchy(data, homePersonId, 0, 5))
    .sum((node) => node.children ? 0 : 1);
  const root = d3.partition<BalancedTreeNode>()
    .size([2 * Math.PI, 300])(hierarchy);
  const arcGenerator = d3.arc<void, FanHierarchyNode>()
    .startAngle((node) => node.x0)
    .endAngle((node) => node.x1)
    .innerRadius((node) => node.depth === 0 ? 0 : node.depth * 75 + 15)
    .outerRadius((node) => node.depth === 0 ? 90 : (node.depth + 1) * 75 + 15)
    .padAngle(0.008)
    .padRadius(150);
  const fanArcs = root.descendants()
    .map((node) => createFanArc(node, arcGenerator))
    .filter((arc): arc is FanArc => Boolean(arc));
  return { nodes: [], edges: [], fanArcs };
}

export function buildSvgLayout(
  data: GedcomData | null,
  homePersonId: string,
  viewMode: FamilyTreeViewMode,
): SvgLayoutResult | null {
  if (!data) {
    return null;
  }
  if (viewMode === "traditional") {
    return buildTraditionalLayout(data, homePersonId);
  }
  if (viewMode === "horizontal") {
    return buildHorizontalLayout(data, homePersonId);
  }
  if (viewMode === "fan") {
    return buildFanLayout(data, homePersonId);
  }
  return { nodes: [], edges: [] };
}
