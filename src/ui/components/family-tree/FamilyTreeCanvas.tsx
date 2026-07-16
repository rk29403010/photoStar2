import { GitBranch, Info, Maximize, Network, PieChart, Upload, ZoomIn, ZoomOut } from "lucide-react";
import * as d3 from "d3";
import type { Person as PhotoStarPerson } from "@contracts/core";
import { resolveImageUrl } from "@boundary/runtime/backend";
import type { AnalysisResult, GedcomData } from "../../../services/gedcom/kinshipTypes";
import type { useTreeViewport } from "./familyTreeHooks";
import { formatName, getYearOnly } from "./familyTreeLayout";
import type {
  FamilyTreeViewMode,
  FanArc,
  PersonLinks,
  SvgLayoutResult,
  TreeEdge,
  TreeNode,
  TreePath,
} from "./familyTreeTypes";

type Viewport = ReturnType<typeof useTreeViewport>;

type WorkspaceProps = {
  readonly gedcomData: GedcomData | null;
  readonly homePersonId: string;
  readonly hoveredNode: string | null;
  readonly layout: SvgLayoutResult | null;
  readonly linksMap: PersonLinks;
  readonly onHover: (personId: string | null) => void;
  readonly onLink: (personId: string) => void;
  readonly onSelectHome: (personId: string) => void;
  readonly onViewPhotos: (personId: string, name: string) => void;
  readonly proximityAnalysis: AnalysisResult | null;
  readonly setViewMode: (mode: FamilyTreeViewMode) => void;
  readonly viewMode: FamilyTreeViewMode;
  readonly viewport: Viewport;
};

function ModeButton(props: {
  readonly active: boolean;
  readonly children: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button onClick={props.onClick} className={`p-1.5 rounded transition-colors border-none cursor-pointer ${props.active ? "bg-brand-accent text-white" : "hover:bg-content/5"}`} title={props.label}>
      {props.children}
    </button>
  );
}

function FamilyTreeToolbar(props: Pick<WorkspaceProps, "gedcomData" | "setViewMode" | "viewMode" | "viewport">) {
  if (!props.gedcomData) {
    return null;
  }
  const choose = (mode: FamilyTreeViewMode) => () => props.setViewMode(mode);
  return (
    <div className="absolute top-4 right-4 z-10 flex bg-surface-secondary rounded-lg border border-content/10 p-1 gap-1 items-center shadow-md">
      <div className="flex border-r border-content/10 pr-2 gap-0.5">
        <ModeButton active={props.viewMode === "traditional"} label="Traditional Tree Layout" onClick={choose("traditional")}><Network className="w-4 h-4" /></ModeButton>
        <ModeButton active={props.viewMode === "horizontal"} label="Horizontal Layout" onClick={choose("horizontal")}><GitBranch className="w-4 h-4 -rotate-90" /></ModeButton>
        <ModeButton active={props.viewMode === "fan"} label="Fan Layout" onClick={choose("fan")}><PieChart className="w-4 h-4" /></ModeButton>
        <ModeButton active={props.viewMode === "list"} label="Table/List View" onClick={choose("list")}><Info className="w-4 h-4" /></ModeButton>
      </div>
      {props.viewMode !== "list" && (
        <>
          <button onClick={() => props.viewport.zoomBy(1.2)} className="p-1.5 rounded hover:bg-content/5 border-none cursor-pointer" title="Zoom In"><ZoomIn className="w-4 h-4" /></button>
          <button onClick={() => props.viewport.zoomBy(0.8)} className="p-1.5 rounded hover:bg-content/5 border-none cursor-pointer" title="Zoom Out"><ZoomOut className="w-4 h-4" /></button>
          <button onClick={props.viewport.reset} className="p-1.5 rounded hover:bg-content/5 border-none cursor-pointer" title="Fit to Screen"><Maximize className="w-4 h-4" /></button>
        </>
      )}
    </div>
  );
}

function EmptyTree() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-content-secondary">
      <Upload className="w-16 h-16 mb-4 opacity-25" />
      <h3 className="text-lg font-bold">No Tree Loaded</h3>
      <p className="text-sm mt-1 max-w-sm text-center">Please choose a family tree from the sidebar or upload a new GEDCOM file.</p>
    </div>
  );
}

function genderLabel(gender: string): string {
  if (gender === "M") {
    return "Male";
  }
  return gender === "F" ? "Female" : "Unknown";
}

function MatchCell(props: {
  readonly link?: PhotoStarPerson;
  readonly onLink: WorkspaceProps["onLink"];
  readonly onViewPhotos: WorkspaceProps["onViewPhotos"];
  readonly personId: string;
}) {
  if (!props.link) {
    return <button onClick={() => props.onLink(props.personId)} className="text-xs border border-content/20 hover:border-brand-accent px-2 py-1 rounded cursor-pointer bg-surface">Link Profile</button>;
  }
  return (
    <button onClick={() => props.onViewPhotos(props.link!.id, props.link!.name || "Unknown")} className="bg-brand-accent text-white px-3 py-1 rounded-full text-xs font-semibold cursor-pointer border-none">
      Matched: {props.link.name} ({props.link.face_count} photos)
    </button>
  );
}

type ProximityPerson = AnalysisResult["sortedPeople"][number];

function ProximityRow(props: {
  readonly linksMap: PersonLinks;
  readonly onLink: WorkspaceProps["onLink"];
  readonly onViewPhotos: WorkspaceProps["onViewPhotos"];
  readonly person: ProximityPerson;
}) {
  const person = props.person;
  return (
    <tr className="border-b border-content/5 hover:bg-content/5 transition-colors">
      <td className="p-3 font-semibold">{person.name}</td>
      <td className="p-3">{genderLabel(person.gender)}</td>
      <td className="p-3">{getYearOnly(person.birthDate) || "Unknown"} - {getYearOnly(person.deathDate) || "present"}</td>
      <td className="p-3 text-center">{person.distance}</td>
      <td className="p-3 text-brand-accent font-semibold">{person.relationship || "Self"}</td>
      <td className="p-3"><MatchCell personId={person.id} link={props.linksMap.get(person.id)} onLink={props.onLink} onViewPhotos={props.onViewPhotos} /></td>
    </tr>
  );
}

function ProximityTable(props: Pick<WorkspaceProps, "linksMap" | "onLink" | "onViewPhotos" | "proximityAnalysis">) {
  if (!props.proximityAnalysis) {
    return <p className="text-content-secondary">Set a Home Person to analyze proximity.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-content/10 bg-surface-secondary">
      <table className="w-full text-left border-collapse text-sm">
        <thead><tr className="bg-content/5 border-b border-content/10 font-bold">
          <th className="p-3">Name</th><th className="p-3">Gender</th><th className="p-3">Lifespan</th>
          <th className="p-3">Closeness Degree</th><th className="p-3">Relationship</th><th className="p-3">PhotoStar Match</th>
        </tr></thead>
        <tbody>{props.proximityAnalysis.sortedPeople.map((person) => <ProximityRow key={person.id} {...props} person={person} />)}</tbody>
      </table>
    </div>
  );
}

function ListView(props: Pick<WorkspaceProps, "linksMap" | "onLink" | "onViewPhotos" | "proximityAnalysis">) {
  return (
    <div className="flex-1 overflow-auto p-8">
      <h2 className="text-xl font-bold mb-4">Relativity & Proximity Table</h2>
      <ProximityTable {...props} />
    </div>
  );
}

function FanArcs(props: {
  readonly arcs: FanArc[];
  readonly onHover: WorkspaceProps["onHover"];
  readonly onSelectHome: WorkspaceProps["onSelectHome"];
}) {
  return (
    <>
      {props.arcs.map((arc) => (
        <path key={arc.id} d={arc.path} fill={arc.fill} stroke="var(--color-content-secondary)" strokeWidth="1" strokeOpacity="0.2" className="cursor-pointer transition-opacity hover:opacity-85" onClick={() => props.onSelectHome(arc.id)} onMouseEnter={() => props.onHover(arc.id)} onMouseLeave={() => props.onHover(null)}>
          <title>{arc.fullNameWithDates}</title>
        </path>
      ))}
      {props.arcs.map((arc) => (
        <g key={`lbl-${arc.id}`} transform={arc.textTransform} className="pointer-events-none">
          <text dy="0.35em" textAnchor="middle" fontSize={arc.fontSize} fontWeight={arc.fontWeight} fill="var(--color-content)">{arc.displayName}</text>
        </g>
      ))}
    </>
  );
}

function edgePath(edge: TreeEdge, nodes: TreeNode[], viewMode: FamilyTreeViewMode): string | null {
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  if (!source || !target) {
    return null;
  }
  if (viewMode === "traditional") {
    return d3.linkVertical()({ source: [source.x, source.y], target: [target.x, target.y] });
  }
  if (viewMode === "horizontal") {
    return d3.linkHorizontal()({ source: [source.x, source.y], target: [target.x, target.y] });
  }
  return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
}

function TreeEdges(props: { readonly layout: SvgLayoutResult; readonly viewMode: FamilyTreeViewMode }) {
  if (props.layout.customPaths) {
    return <>{props.layout.customPaths.map((path: TreePath) => <path key={path.path} d={path.path} fill="none" stroke={path.color} strokeWidth={path.isBold ? 3 : 1.5} />)}</>;
  }
  return (
    <>{props.layout.edges.map((edge) => {
      const path = edgePath(edge, props.layout.nodes, props.viewMode);
      return path ? <path key={`${edge.source}-${edge.target}`} d={path} fill="none" stroke="var(--color-brand-accent)" strokeOpacity="0.8" strokeWidth="3" /> : null;
    })}</>
  );
}

function traditionalNodeClass(node: TreeNode): string {
  if (node.gender === "M") {
    return node.isMain ? "fill-blue-500/10 stroke-blue-500 stroke-[2]" : "fill-blue-500/5 stroke-content/20 stroke-[1]";
  }
  if (node.gender === "F") {
    return node.isMain ? "fill-pink-500/10 stroke-pink-500 stroke-[2]" : "fill-pink-500/5 stroke-content/20 stroke-[1]";
  }
  return "fill-surface border-content/10";
}

function nodeClass(node: TreeNode, viewMode: FamilyTreeViewMode, isHome: boolean): string {
  if (isHome) {
    return "fill-brand-accent/20 stroke-brand-accent stroke-[3]";
  }
  if (viewMode === "traditional") {
    return traditionalNodeClass(node);
  }
  if (node.gender === "M") {
    return "fill-blue-500/10 stroke-blue-500";
  }
  return node.gender === "F" ? "fill-pink-500/10 stroke-pink-500" : "fill-surface border-content/10";
}

function nodeLifespan(node: TreeNode, data: GedcomData): string {
  const person = data.people[node.id];
  if (!person) {
    return "Unknown";
  }
  const birth = getYearOnly(person.birthDate);
  const death = getYearOnly(person.deathDate);
  return birth || death ? `${birth || "?"}-${death}` : "Unknown";
}

function LinkedNodeMarker(props: { readonly link: PhotoStarPerson; readonly node: TreeNode; readonly onViewPhotos: WorkspaceProps["onViewPhotos"] }) {
  return (
    <g transform="translate(0, 24)" className="cursor-pointer" onClick={() => props.onViewPhotos(props.link.id, props.link.name || "Unknown")}>
      <circle r="12" fill="var(--color-bg-brand-accent)" className="stroke-surface stroke-2" />
      {props.link.cover_image ? (
        <>
          <clipPath id={`avatar-clip-${props.node.id}`}><circle r="11" /></clipPath>
          {/* eslint-disable-next-line deslint/image-alt-text -- alt is not a valid SVG image prop in React SVGProps typing */}
          <image href={resolveImageUrl(props.link.cover_image) || undefined} x="-11" y="-11" width="22" height="22" clipPath={`url(#avatar-clip-${props.node.id})`} />
        </>
      ) : <text y="3" textAnchor="middle" fill="#fff" className="text-[9px] font-bold">📷</text>}
    </g>
  );
}

function TreeNodeCard(props: {
  readonly data: GedcomData;
  readonly homePersonId: string;
  readonly hoveredNode: string | null;
  readonly link?: PhotoStarPerson;
  readonly node: TreeNode;
  readonly onHover: WorkspaceProps["onHover"];
  readonly onLink: WorkspaceProps["onLink"];
  readonly onSelectHome: WorkspaceProps["onSelectHome"];
  readonly onViewPhotos: WorkspaceProps["onViewPhotos"];
  readonly viewMode: FamilyTreeViewMode;
}) {
  const isHome = props.node.id === props.homePersonId;
  const name = formatName(props.node.name);
  return (
    <g transform={`translate(${props.node.x}, ${props.node.y})`} onMouseEnter={() => props.onHover(props.node.id)} onMouseLeave={() => props.onHover(null)}>
      <rect x="-70" y="-35" width="140" height="70" rx="8" className={`${nodeClass(props.node, props.viewMode, isHome)} cursor-pointer transition-shadow shadow-xs`} onClick={() => props.onSelectHome(props.node.id)} />
      <text y={name.last ? "-10" : "-3"} textAnchor="middle" className="text-xs pointer-events-none fill-content font-bold">{name.first}</text>
      {name.last && <text y="5" textAnchor="middle" className="text-xs pointer-events-none fill-content font-bold">{name.last}</text>}
      <text y="18" textAnchor="middle" className="text-[10px] pointer-events-none fill-content-secondary">{nodeLifespan(props.node, props.data)}</text>
      {props.link && <LinkedNodeMarker link={props.link} node={props.node} onViewPhotos={props.onViewPhotos} />}
      {!props.link && props.hoveredNode === props.node.id && (
        <g transform="translate(0, 24)" className="cursor-pointer" onClick={() => props.onLink(props.node.id)}>
          <circle r="10" fill="var(--color-bg-surface-secondary)" className="stroke-content/20 stroke-1 hover:fill-brand-accent/20 hover:stroke-brand-accent" />
          <text y="3.5" textAnchor="middle" className="text-[10px] pointer-events-none fill-content-secondary">+</text>
        </g>
      )}
    </g>
  );
}

function StandardTree(props: WorkspaceProps & { readonly gedcomData: GedcomData; readonly layout: SvgLayoutResult }) {
  return (
    <>
      <TreeEdges layout={props.layout} viewMode={props.viewMode} />
      {props.layout.nodes.map((node) => (
        <TreeNodeCard key={node.id} data={props.gedcomData} homePersonId={props.homePersonId} hoveredNode={props.hoveredNode} link={props.linksMap.get(node.id)} node={node} onHover={props.onHover} onLink={props.onLink} onSelectHome={props.onSelectHome} onViewPhotos={props.onViewPhotos} viewMode={props.viewMode} />
      ))}
    </>
  );
}

function FamilyTreeDiagram(props: WorkspaceProps & { readonly gedcomData: GedcomData; readonly layout: SvgLayoutResult }) {
  const transform = `translate(${props.viewport.pan.x + globalThis.innerWidth / 4}, ${props.viewport.pan.y + globalThis.innerHeight / 4}) scale(${props.viewport.zoom})`;
  const fanArcs = props.viewMode === "fan" ? props.layout.fanArcs : undefined;
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- drag pan/zoom container for SVG family tree visualization
    <div className="flex-1 w-full h-full select-none cursor-grab active:cursor-grabbing overflow-hidden" onMouseDown={props.viewport.mouseDown} onMouseMove={props.viewport.mouseMove} onMouseUp={props.viewport.mouseUp} onMouseLeave={props.viewport.mouseUp}>
      <svg className="w-full h-full"><g transform={transform}>
        {fanArcs
          ? <FanArcs arcs={fanArcs} onHover={props.onHover} onSelectHome={props.onSelectHome} />
          : <StandardTree {...props} gedcomData={props.gedcomData} layout={props.layout} />}
      </g></svg>
    </div>
  );
}

function WorkspaceContent(props: WorkspaceProps) {
  if (!props.gedcomData || !props.layout) {
    return <EmptyTree />;
  }
  if (props.viewMode === "list") {
    return <ListView {...props} />;
  }
  return <FamilyTreeDiagram {...props} gedcomData={props.gedcomData} layout={props.layout} />;
}

export function FamilyTreeWorkspace(props: WorkspaceProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 relative bg-surface">
      <FamilyTreeToolbar {...props} />
      <WorkspaceContent {...props} />
    </div>
  );
}
