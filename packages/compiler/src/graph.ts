/**
 * DAG analysis: topological sort, parallel level detection, merge node identification.
 */

import type { ParsedWorkflow, ParsedNode, Edge } from './parser.js';

/** A node grouped with its execution level for parallel scheduling */
export interface ExecutionLevel {
  level: number;
  nodes: string[]; // node names
}

/** DAG analysis result */
export interface WorkflowGraph {
  /** Nodes in topological order */
  sortedNodes: string[];
  /** Execution levels for parallel scheduling */
  levels: ExecutionLevel[];
  /** Nodes that have multiple input slots (merge nodes) */
  mergeNodes: Set<string>;
  /** Trigger/entry nodes (no incoming edges) */
  entryNodes: string[];
  /** Adjacency list: source -> [{ target, outputIndex, inputIndex, connectionType }] */
  adjacency: Map<string, AdjacencyEntry[]>;
  /** Reverse adjacency: target -> [{ source, outputIndex, inputIndex, connectionType }] */
  reverseAdjacency: Map<string, AdjacencyEntry[]>;
}

export interface AdjacencyEntry {
  node: string;
  outputIndex: number;
  inputIndex: number;
  connectionType: string;
}

/**
 * Build a complete workflow graph from a parsed workflow.
 */
export function buildGraph(workflow: ParsedWorkflow): WorkflowGraph {
  const adjacency = buildAdjacencyList(workflow.edges);
  const reverseAdjacency = buildReverseAdjacencyList(workflow.edges);
  const entryNodes = findEntryNodes(workflow.nodes, reverseAdjacency);
  const mergeNodes = findMergeNodes(workflow.edges);
  const sortedNodes = topologicalSort(workflow.nodes, adjacency, reverseAdjacency);
  const levels = computeParallelLevels(sortedNodes, reverseAdjacency);

  return {
    sortedNodes,
    levels,
    mergeNodes,
    entryNodes,
    adjacency,
    reverseAdjacency,
  };
}

function buildAdjacencyList(edges: Edge[]): Map<string, AdjacencyEntry[]> {
  const adj = new Map<string, AdjacencyEntry[]>();
  for (const edge of edges) {
    if (!adj.has(edge.sourceNode)) {
      adj.set(edge.sourceNode, []);
    }
    adj.get(edge.sourceNode)!.push({
      node: edge.targetNode,
      outputIndex: edge.sourceOutput,
      inputIndex: edge.targetInput,
      connectionType: edge.connectionType,
    });
  }
  return adj;
}

function buildReverseAdjacencyList(edges: Edge[]): Map<string, AdjacencyEntry[]> {
  const rev = new Map<string, AdjacencyEntry[]>();
  for (const edge of edges) {
    if (!rev.has(edge.targetNode)) {
      rev.set(edge.targetNode, []);
    }
    rev.get(edge.targetNode)!.push({
      node: edge.sourceNode,
      outputIndex: edge.sourceOutput,
      inputIndex: edge.targetInput,
      connectionType: edge.connectionType,
    });
  }
  return rev;
}

/** Find nodes with no incoming main edges (triggers, start nodes) */
function findEntryNodes(
  nodes: Map<string, ParsedNode>,
  reverseAdjacency: Map<string, AdjacencyEntry[]>,
): string[] {
  const entries: string[] = [];
  for (const [name] of nodes) {
    const incomingMain = (reverseAdjacency.get(name) ?? []).filter(
      (e) => e.connectionType === 'main',
    );
    if (incomingMain.length === 0) {
      entries.push(name);
    }
  }
  return entries;
}

/** Find nodes that receive input on multiple input slots (merge nodes) */
function findMergeNodes(edges: Edge[]): Set<string> {
  const inputSlots = new Map<string, Set<number>>();
  for (const edge of edges) {
    if (edge.connectionType !== 'main') continue;
    if (!inputSlots.has(edge.targetNode)) {
      inputSlots.set(edge.targetNode, new Set());
    }
    inputSlots.get(edge.targetNode)!.add(edge.targetInput);
  }

  const mergeNodes = new Set<string>();
  for (const [node, slots] of inputSlots) {
    if (slots.size > 1) {
      mergeNodes.add(node);
    }
  }
  return mergeNodes;
}

/** Kahn's algorithm for topological sort */
function topologicalSort(
  nodes: Map<string, ParsedNode>,
  adjacency: Map<string, AdjacencyEntry[]>,
  reverseAdjacency: Map<string, AdjacencyEntry[]>,
): string[] {
  // Only consider 'main' connections for execution ordering
  const inDegree = new Map<string, number>();
  for (const [name] of nodes) {
    const mainIncoming = (reverseAdjacency.get(name) ?? []).filter(
      (e) => e.connectionType === 'main',
    );
    inDegree.set(name, mainIncoming.length);
  }

  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) {
      queue.push(name);
    }
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);

    const neighbors = (adjacency.get(node) ?? []).filter(
      (e) => e.connectionType === 'main',
    );
    for (const neighbor of neighbors) {
      const currentDegree = inDegree.get(neighbor.node)!;
      inDegree.set(neighbor.node, currentDegree - 1);
      if (currentDegree - 1 === 0) {
        queue.push(neighbor.node);
      }
    }
  }

  if (sorted.length !== nodes.size) {
    const missing = [...nodes.keys()].filter((n) => !sorted.includes(n));
    throw new Error(
      `Workflow contains cycles or disconnected nodes: ${missing.join(', ')}`,
    );
  }

  return sorted;
}

/**
 * Compute parallel execution levels.
 * Each level contains nodes that can run concurrently.
 * A node's level = max(levels of all its dependencies) + 1.
 */
function computeParallelLevels(
  sortedNodes: string[],
  reverseAdjacency: Map<string, AdjacencyEntry[]>,
): ExecutionLevel[] {
  const nodeLevel = new Map<string, number>();

  for (const node of sortedNodes) {
    const deps = (reverseAdjacency.get(node) ?? []).filter(
      (e) => e.connectionType === 'main',
    );

    if (deps.length === 0) {
      nodeLevel.set(node, 0);
    } else {
      const maxDepLevel = Math.max(
        ...deps.map((d) => nodeLevel.get(d.node) ?? 0),
      );
      nodeLevel.set(node, maxDepLevel + 1);
    }
  }

  // Group nodes by level
  const levelMap = new Map<number, string[]>();
  for (const [node, level] of nodeLevel) {
    if (!levelMap.has(level)) {
      levelMap.set(level, []);
    }
    levelMap.get(level)!.push(node);
  }

  // Convert to sorted array
  const levels: ExecutionLevel[] = [];
  const maxLevel = Math.max(...levelMap.keys(), -1);
  for (let i = 0; i <= maxLevel; i++) {
    levels.push({
      level: i,
      nodes: levelMap.get(i) ?? [],
    });
  }

  return levels;
}
