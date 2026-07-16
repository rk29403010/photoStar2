import type { GedcomData, Person, GraphNode, GraphLink, AnalysisResult } from './kinshipTypes';

export type RelationshipType = 'parent' | 'child' | 'spouse';

export const buildGraph = (data: GedcomData, homePersonId: string | null) => {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const personIds = Object.keys(data.people);

  personIds.forEach((id) => {
    const p = data.people[id];
    nodes.push({
      id: p.id,
      label: p.name,
      gender: p.gender,
      birthDate: p.birthDate,
      deathDate: p.deathDate,
      isHome: p.id === homePersonId,
      distance: undefined,
    });
  });

  // Build edges based on families
  // Spouse <-> Spouse
  // Parent <-> Child
  Object.values(data.families).forEach((fam) => {
    const { husb, wife, children } = fam;

    // Spouse link
    if (husb && wife && data.people[husb] && data.people[wife]) {
      links.push({ source: husb, target: wife, type: 'spouse' });
    }

    // Parent-Child links
    children.forEach((childId) => {
      if (!data.people[childId]) { return; }

      if (husb && data.people[husb]) {
        links.push({ source: husb, target: childId, type: 'parent-child' });
      }
      if (wife && data.people[wife]) {
        links.push({ source: wife, target: childId, type: 'parent-child' });
      }
    });
  });

  return { nodes, links };
};

const getParents = (personId: string, data: GedcomData): string[] => {
  const person = data.people[personId];
  if (!person?.famc) { return []; }
  const family = data.families[person.famc];
  if (!family) { return []; }
  const parents = [];
  if (family.husb) { parents.push(family.husb); }
  if (family.wife) { parents.push(family.wife); }
  return parents;
};

type PathShape = {
  down: number;
  up: number;
  validConsanguineous: boolean;
};

type GenderedNames = { F: string; M: string; U: string };

function analyzePath(pathRelations: RelationshipType[]): PathShape {
  let up = 0;
  let down = 0;
  let descending = false;
  for (const step of pathRelations) {
    if (step === 'spouse') {
      return { down, up, validConsanguineous: false };
    }
    if (step === 'parent' && descending) {
      return { down, up, validConsanguineous: false };
    }
    if (step === 'parent') {
      up++;
    } else {
      descending = true;
      down++;
    }
  }
  return { down, up, validConsanguineous: true };
}

function isHalfRelationship(
  shape: PathShape,
  pathNodes: string[],
  data: GedcomData,
): boolean {
  if (!shape.validConsanguineous || shape.up <= 0 || shape.down <= 0) {
    return false;
  }
  const child1 = pathNodes[shape.up - 1];
  const child2 = pathNodes[shape.up + 1];
  if (!child1 || !child2) { return false; }
  const parents1 = getParents(child1, data);
  const parents2 = getParents(child2, data);
  return parents1.filter(parent => parents2.includes(parent)).length === 1;
}

function genderedName(gender: string, names: GenderedNames): string {
  return names[gender as keyof GenderedNames] || names.U;
}

function directRelationshipName(
  path: string,
  prefix: string,
  gender: string,
): string | null {
  const names: Record<string, GenderedNames> = {
    'parent': { M: 'Father', F: 'Mother', U: 'Parent' },
    'child': { M: 'Son', F: 'Daughter', U: 'Child' },
    'spouse': { M: 'Husband', F: 'Wife', U: 'Spouse' },
    'parent-parent': { M: 'Grandfather', F: 'Grandmother', U: 'Grandparent' },
    'child-child': { M: 'Grandson', F: 'Granddaughter', U: 'Grandchild' },
    'parent-child': { M: `${prefix}Brother`, F: `${prefix}Sister`, U: `${prefix}Sibling` },
    'parent-parent-child': { M: `${prefix}Uncle`, F: `${prefix}Aunt`, U: `${prefix}Uncle/Aunt` },
    'parent-child-child': { M: `${prefix}Nephew`, F: `${prefix}Niece`, U: `${prefix}Nephew/Niece` },
    'parent-parent-child-child': { M: `${prefix}First Cousin`, F: `${prefix}First Cousin`, U: `${prefix}First Cousin` },
    'spouse-parent': { M: 'Father-in-law', F: 'Mother-in-law', U: 'Parent-in-law' },
    'child-spouse': { M: 'Son-in-law', F: 'Daughter-in-law', U: 'Child-in-law' },
    'spouse-child': { M: 'Step-Son', F: 'Step-Daughter', U: 'Step-Child' },
    'parent-spouse': { M: 'Step-Father', F: 'Step-Mother', U: 'Step-Parent' },
    'spouse-parent-child': { M: 'Brother-in-law', F: 'Sister-in-law', U: 'Sibling-in-law' },
    'parent-child-spouse': { M: 'Brother-in-law', F: 'Sister-in-law', U: 'Sibling-in-law' },
    'spouse-parent-child-spouse': { M: 'Brother-in-law', F: 'Sister-in-law', U: 'Sibling-in-law' },
    'parent-spouse-child': { M: 'Step-Brother', F: 'Step-Sister', U: 'Step-Sibling' },
  };
  return names[path] ? genderedName(gender, names[path]) : null;
}

function descendantName(shape: PathShape, gender: string): string | null {
  if (shape.up !== 0 || shape.down <= 2) { return null; }
  const suffix = genderedName(gender, { M: 'son', F: 'daughter', U: 'child' });
  return `${shape.down - 2}x Great-Grand${suffix}`;
}

function ancestorName(shape: PathShape, gender: string): string | null {
  if (shape.down !== 0 || shape.up <= 2) { return null; }
  const suffix = genderedName(gender, { M: 'father', F: 'mother', U: 'parent' });
  return `${shape.up - 2}x Great-Grand${suffix}`;
}

function niblingName(shape: PathShape, prefix: string, gender: string): string | null {
  if (shape.up !== 1 || shape.down <= 2) { return null; }
  const suffix = genderedName(gender, { M: 'nephew', F: 'niece', U: 'nephew/niece' });
  return `${prefix}${shape.down - 2}x Great-Grand${suffix}`;
}

function avuncularName(shape: PathShape, prefix: string, gender: string): string | null {
  if (shape.up <= 2 || shape.down !== 1) { return null; }
  const suffix = genderedName(gender, { M: 'uncle', F: 'aunt', U: 'uncle/aunt' });
  return `${prefix}${shape.up - 2}x Great-Grand${suffix}`;
}

function cousinName(shape: PathShape, prefix: string): string | null {
  if (shape.up < 2 || shape.down < 2) { return null; }
  const cousinDegree = Math.min(shape.up, shape.down) - 1;
  const removed = Math.abs(shape.up - shape.down);
  const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
  const degree = ordinals[cousinDegree - 1] || `${cousinDegree}th`;
  const removal = removed === 0 ? '' : ` ${removed}x removed`;
  return `${prefix}${degree} Cousin${removal}`;
}

function extendedRelationshipName(
  shape: PathShape,
  prefix: string,
  gender: string,
): string | null {
  if (!shape.validConsanguineous) { return null; }
  return descendantName(shape, gender)
    ?? ancestorName(shape, gender)
    ?? niblingName(shape, prefix, gender)
    ?? avuncularName(shape, prefix, gender)
    ?? cousinName(shape, prefix);
}

const getRelationshipName = (
  pathRelations: RelationshipType[],
  pathNodes: string[],
  data: GedcomData,
  gender: string
): string => {
  if (pathRelations.length === 0) { return 'Self'; }
  const shape = analyzePath(pathRelations);
  const prefix = isHalfRelationship(shape, pathNodes, data) ? 'Half-' : '';
  return directRelationshipName(pathRelations.join('-'), prefix, gender)
    ?? extendedRelationshipName(shape, prefix, gender)
    ?? 'Relative';
};

type AdjacencyEntry = { id: string; relation: RelationshipType };
type SearchItem = {
  dist: number;
  id: string;
  pathNodes: string[];
  pathRelations: RelationshipType[];
};

function graphNodeId(node: string | GraphNode): string {
  return typeof node === 'object' ? node.id : node;
}

function buildAdjacency(nodes: GraphNode[], links: GraphLink[]): Record<string, AdjacencyEntry[]> {
  const adjacency: Record<string, AdjacencyEntry[]> = {};
  nodes.forEach(node => { adjacency[node.id] = []; });
  links.forEach(link => {
    const source = graphNodeId(link.source);
    const target = graphNodeId(link.target);
    if (link.type === 'parent-child') {
      adjacency[source].push({ id: target, relation: 'child' });
      adjacency[target].push({ id: source, relation: 'parent' });
    } else if (link.type === 'spouse') {
      adjacency[source].push({ id: target, relation: 'spouse' });
      adjacency[target].push({ id: source, relation: 'spouse' });
    }
  });
  return adjacency;
}

function searchRelationships(adjacency: Record<string, AdjacencyEntry[]>, homePersonId: string) {
  const queue: SearchItem[] = [{ id: homePersonId, dist: 0, pathRelations: [], pathNodes: [homePersonId] }];
  const distances: Record<string, number> = { [homePersonId]: 0 };
  const pathsRelations: Record<string, RelationshipType[]> = { [homePersonId]: [] };
  const pathsNodes: Record<string, string[]> = { [homePersonId]: [homePersonId] };
  let maxDistance = 0;
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) { continue; }
    maxDistance = Math.max(maxDistance, item.dist);
    for (const neighbor of adjacency[item.id] || []) {
      if (distances[neighbor.id] !== undefined) { continue; }
      const pathRelations = [...item.pathRelations, neighbor.relation];
      const pathNodes = [...item.pathNodes, neighbor.id];
      distances[neighbor.id] = item.dist + 1;
      pathsRelations[neighbor.id] = pathRelations;
      pathsNodes[neighbor.id] = pathNodes;
      queue.push({ id: neighbor.id, dist: item.dist + 1, pathRelations, pathNodes });
    }
  }
  return { distances, maxDistance, pathsNodes, pathsRelations };
}

export const calculateProximity = (
  data: GedcomData,
  homePersonId: string
): AnalysisResult => {
  const { nodes, links } = buildGraph(data, homePersonId);
  const { distances, maxDistance, pathsNodes, pathsRelations } = searchRelationships(
    buildAdjacency(nodes, links),
    homePersonId,
  );

  // Combine with person data
  const sortedPeople = Object.values(data.people)
    .map((p) => ({
      ...p,
      distance: distances[p.id] ?? -1,
      relationship: distances[p.id] === undefined ? undefined : getRelationshipName(pathsRelations[p.id], pathsNodes[p.id], data, p.gender),
    }))
    .filter(p => p.distance !== -1)
    .sort((a, b) => a.distance - b.distance);

  return { sortedPeople, maxDistance };
};

export const generateCsv = (people: (Person & { distance: number; relationship?: string })[]): string => {
  const headers = ['Name', 'Gender', 'Date of Birth', 'Date of Death', 'Closeness Degree', 'Relationship'];
  const rows = people.map(p => {
    const name = `"${p.name.replaceAll('"', '""')}"`; // Escape quotes
    return [
      name,
      p.gender,
      p.birthDate || '',
      p.deathDate || '',
      p.distance,
      `"${p.relationship || ''}"`
    ].join(',');
  });
  return [headers.join(','), ...rows].join('\n');
};
