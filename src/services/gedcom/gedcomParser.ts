import type { GedcomData, Person, Family } from './kinshipTypes';

type ParsedGedcomLine = {
  id?: string;
  level: number;
  tag?: string;
  value: string;
};

const LINE_PATTERN = /^\s*(\d+)\s+(@\w+@)?\s*(\w+)?\s*(.*)$/;

function parseLine(line: string): ParsedGedcomLine | null {
  const match = line.match(LINE_PATTERN);
  if (!match) { return null; }
  return {
    level: parseInt(match[1], 10),
    id: match[2],
    tag: match[3],
    value: match[4],
  };
}

function applyBasicPersonTag(person: Person, tag: string | undefined, value: string): void {
  switch (tag) {
    case 'NAME':
      person.name = value.replaceAll('/', '').trim();
      break;
    case 'SEX':
      person.gender = value === 'M' || value === 'F' ? value : 'U';
      break;
    case 'FAMC':
      person.famc = value;
      break;
    case 'FAMS':
      person.fams.push(value);
      break;
    case undefined:
      break;
    default:
      break;
  }
}

function applyPersonDate(person: Person, currentTag: string, value: string): void {
  if (currentTag === 'BIRT') { person.birthDate = value; }
  if (currentTag === 'DEAT') { person.deathDate = value; }
}

function applyPersonTag(
  person: Person,
  tag: string | undefined,
  value: string,
  currentTag: string,
): string {
  if (tag === 'BIRT' || tag === 'DEAT') { return tag; }
  if (tag === 'DATE') {
    applyPersonDate(person, currentTag, value);
    return currentTag;
  }
  applyBasicPersonTag(person, tag, value);
  return '';
}

function applyFamilyTag(family: Family, tag: string | undefined, value: string): void {
  switch (tag) {
    case 'HUSB':
      family.husb = value;
      break;
    case 'WIFE':
      family.wife = value;
      break;
    case 'CHIL':
      family.children.push(value);
      break;
    case undefined:
      break;
    default:
      break;
  }
}

function startRecord(
  line: ParsedGedcomLine,
  people: Record<string, Person>,
  families: Record<string, Family>,
): { family: Family | null; person: Person | null } {
  if (line.id && line.tag === 'INDI') {
    const person: Person = { id: line.id, name: 'Unknown', gender: 'U', fams: [] };
    people[line.id] = person;
    return { family: null, person };
  }
  if (line.id && line.tag === 'FAM') {
    const family: Family = { id: line.id, children: [] };
    families[line.id] = family;
    return { family, person: null };
  }
  return { family: null, person: null };
}

export const parseGedcom = (content: string): GedcomData => {
  const lines = content.split(/\r?\n/);
  const people: Record<string, Person> = {};
  const families: Record<string, Family> = {};

  let currentPerson: Person | null = null;
  let currentFamily: Family | null = null;
  let currentTag = '';

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) { continue; }
    if (parsed.level === 0) {
      const record = startRecord(parsed, people, families);
      currentPerson = record.person;
      currentFamily = record.family;
    } else if (currentPerson) {
      currentTag = applyPersonTag(currentPerson, parsed.tag, parsed.value, currentTag);
    } else if (currentFamily) {
      applyFamilyTag(currentFamily, parsed.tag, parsed.value);
    }
  }

  return { people, families };
};
