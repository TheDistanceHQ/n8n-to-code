/**
 * Diff engine for incremental workflow updates.
 * Compares a new workflow JSON against the __meta__.json from a previous compilation
 * and determines which nodes need regeneration.
 */

import type { N8nWorkflow } from '@n8n-to-code/types';
import { createHash } from 'crypto';

export interface MetaFile {
  sourceWorkflowId: string | null;
  sourceHash: string;
  generatedAt: string;
  parallel: boolean;
  nodes: Record<string, MetaNode>;
}

export interface MetaNode {
  type: string;
  typeVersion: number;
  configHash: string;
  compilationMode: 'inline' | 'shimmed' | 'skip';
}

export interface WorkflowDiff {
  added: string[];     // Node names that are new
  removed: string[];   // Node names that were deleted
  changed: string[];   // Node names whose config changed
  unchanged: string[]; // Node names that haven't changed
  connectionsChanged: boolean; // Whether the wiring changed
}

/**
 * Compute the diff between a new workflow and the stored meta.
 */
export function diffWorkflow(
  newWorkflow: N8nWorkflow,
  meta: MetaFile,
): WorkflowDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];

  const oldNodeNames = new Set(Object.keys(meta.nodes));
  const newNodeNames = new Set(
    newWorkflow.nodes
      .filter((n) => n.type !== 'n8n-nodes-base.stickyNote')
      .map((n) => n.name),
  );

  // Find added nodes
  for (const name of newNodeNames) {
    if (!oldNodeNames.has(name)) {
      added.push(name);
    }
  }

  // Find removed nodes
  for (const name of oldNodeNames) {
    if (!newNodeNames.has(name)) {
      removed.push(name);
    }
  }

  // Find changed vs unchanged
  for (const node of newWorkflow.nodes) {
    if (node.type === 'n8n-nodes-base.stickyNote') continue;
    if (!oldNodeNames.has(node.name)) continue; // already in 'added'

    const oldMeta = meta.nodes[node.name];
    const newHash = hashNodeConfig(node);

    if (oldMeta.configHash !== newHash) {
      changed.push(node.name);
    } else {
      unchanged.push(node.name);
    }
  }

  // Check if connections changed
  const newConnectionsHash = hashString(JSON.stringify(newWorkflow.connections));
  const connectionsChanged = newConnectionsHash !== meta.sourceHash;

  return { added, removed, changed, unchanged, connectionsChanged };
}

/**
 * Apply updates based on a diff.
 * Returns the set of files that need to be regenerated.
 */
export function applyUpdates(diff: WorkflowDiff): {
  regenerateNodes: string[];
  deleteNodes: string[];
  regenerateWorkflow: boolean;
} {
  return {
    regenerateNodes: [...diff.added, ...diff.changed],
    deleteNodes: diff.removed,
    regenerateWorkflow:
      diff.added.length > 0 ||
      diff.removed.length > 0 ||
      diff.changed.length > 0 ||
      diff.connectionsChanged,
  };
}

function hashNodeConfig(node: { type: string; typeVersion: number; parameters: unknown; credentials?: unknown }): string {
  const configStr = JSON.stringify({
    type: node.type,
    typeVersion: node.typeVersion,
    parameters: node.parameters,
    credentials: node.credentials ?? {},
  });
  return hashString(configStr);
}

function hashString(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}
