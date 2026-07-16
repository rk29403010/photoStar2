export type Person = {
  id: string;
  name: string;
  gender: 'M' | 'F' | 'U';
  birthDate?: string;
  deathDate?: string;
  famc?: string; // Family ID where they are a child
  fams: string[]; // Family IDs where they are a spouse
}

export type Family = {
  id: string;
  husb?: string;
  wife?: string;
  children: string[];
}

export type GedcomData = {
  people: Record<string, Person>;
  families: Record<string, Family>;
}

export type GraphNode = {
  id: string;
  label: string;
  gender: 'M' | 'F' | 'U';
  birthDate?: string;
  deathDate?: string;
  distance?: number; // Distance from home person
  isHome?: boolean;

  // d3-force simulation properties
  index?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export type GraphLink = {
  source: string | GraphNode;
  target: string | GraphNode;
  type: 'parent-child' | 'spouse';

  // d3-force simulation properties
  index?: number;
}

export type AnalysisResult = {
  sortedPeople: (Person & { distance: number; relationship?: string })[];
  maxDistance: number;
}
