/**
 * Parses n8n workflow JSON into an internal representation (IR)
 * suitable for DAG analysis and code generation.
 */

import type {
  N8nWorkflow,
  N8nNode,
  N8nConnections,
  N8nConnectionTarget,
} from '@n8n-to-code/types';
import { SKIP_NODE_TYPES, INLINE_NODE_TYPES } from '@n8n-to-code/types';

/** Internal representation of a parsed workflow */
export interface ParsedWorkflow {
  id: string | undefined;
  name: string;
  nodes: Map<string, ParsedNode>;
  edges: Edge[];
  settings: N8nWorkflow['settings'];
}

export interface ParsedNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  parameters: Record<string, unknown>;
  credentials: Record<string, { id: string; name: string }>;
  disabled: boolean;
  onError?: string;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  compilationMode: 'inline' | 'shimmed' | 'skip';
}

export interface Edge {
  sourceNode: string;
  sourceOutput: number;
  targetNode: string;
  targetInput: number;
  connectionType: string;
}

/**
 * Parse an n8n workflow JSON object into a ParsedWorkflow IR.
 */
export function parseWorkflow(workflow: N8nWorkflow): ParsedWorkflow {
  const nodes = new Map<string, ParsedNode>();
  const edges: Edge[] = [];

  // Parse nodes
  for (const node of workflow.nodes) {
    if (SKIP_NODE_TYPES.has(node.type)) {
      continue; // Skip visual-only nodes like sticky notes
    }

    nodes.set(node.name, parseNode(node));
  }

  // Parse connections into edges
  parseConnections(workflow.connections, edges, nodes);

  return {
    id: workflow.id,
    name: workflow.name,
    nodes,
    edges,
    settings: workflow.settings,
  };
}

function parseNode(node: N8nNode): ParsedNode {
  let compilationMode: ParsedNode['compilationMode'];

  if (SKIP_NODE_TYPES.has(node.type)) {
    compilationMode = 'skip';
  } else if (INLINE_NODE_TYPES.has(node.type)) {
    compilationMode = 'inline';
  } else {
    compilationMode = 'shimmed';
  }

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    typeVersion: node.typeVersion,
    parameters: node.parameters,
    credentials: node.credentials ?? {},
    disabled: node.disabled ?? false,
    onError: node.onError,
    retryOnFail: node.retryOnFail,
    maxTries: node.maxTries,
    waitBetweenTries: node.waitBetweenTries,
    compilationMode,
  };
}

function parseConnections(
  connections: N8nConnections,
  edges: Edge[],
  nodes: Map<string, ParsedNode>,
): void {
  for (const [sourceName, connectionTypes] of Object.entries(connections)) {
    if (!nodes.has(sourceName)) continue; // Skip connections from skipped nodes

    for (const [connectionType, outputs] of Object.entries(connectionTypes)) {
      for (let outputIndex = 0; outputIndex < outputs.length; outputIndex++) {
        const targets: N8nConnectionTarget[] = outputs[outputIndex];
        for (const target of targets) {
          if (!nodes.has(target.node)) continue; // Skip connections to skipped nodes

          edges.push({
            sourceNode: sourceName,
            sourceOutput: outputIndex,
            targetNode: target.node,
            targetInput: target.index,
            connectionType,
          });
        }
      }
    }
  }
}
