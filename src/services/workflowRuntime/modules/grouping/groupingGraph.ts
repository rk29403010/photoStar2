export interface SimilarityEdgeRef {
    leftId: string;
    rightId: string;
}

function buildAdjacency(nodes: string[], edges: SimilarityEdgeRef[]): Map<string, Set<string>> {
    const adjacency = new Map<string, Set<string>>();
    for (const node of nodes) {
        adjacency.set(node, new Set());
    }
    for (const edge of edges) {
        adjacency.get(edge.leftId)?.add(edge.rightId);
        adjacency.get(edge.rightId)?.add(edge.leftId);
    }
    return adjacency;
}

export function buildConnectedComponents(nodes: string[], edges: SimilarityEdgeRef[]): string[][] {
    const adjacency = buildAdjacency(nodes, edges);
    const visited = new Set<string>();
    const orderedNodes = [...nodes].sort((left, right) => left.localeCompare(right));
    const components: string[][] = [];

    for (const node of orderedNodes) {
        if (visited.has(node)) {
            continue;
        }

        const stack = [node];
        const component: string[] = [];
        visited.add(node);

        while (stack.length > 0) {
            const current = stack.pop();
            if (!current) {
                continue;
            }
            component.push(current);
            const neighbours = [...(adjacency.get(current) ?? [])].sort((left, right) => right.localeCompare(left));
            for (const neighbour of neighbours) {
                if (visited.has(neighbour)) {
                    continue;
                }
                visited.add(neighbour);
                stack.push(neighbour);
            }
        }

        components.push(component.sort((left, right) => left.localeCompare(right)));
    }

    return components;
}
