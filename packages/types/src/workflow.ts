/**
 * Types representing an n8n workflow JSON structure.
 * These mirror the n8n workflow export format.
 */

export interface N8nWorkflow {
  id?: string;
  name: string;
  active: boolean;
  nodes: N8nNode[];
  connections: N8nConnections;
  settings?: N8nWorkflowSettings;
  staticData?: Record<string, unknown> | null;
  pinData?: Record<string, unknown>;
  tags?: Array<{ id: string; name: string }>;
  versionId?: string;
}

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, N8nCredentialRef>;
  disabled?: boolean;
  notes?: string;
  webhookId?: string;
  onError?: 'stopWorkflow' | 'continueRegularOutput' | 'continueErrorOutput';
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
}

export interface N8nCredentialRef {
  id: string;
  name: string;
}

/**
 * Connections object: keyed by source node name.
 * Each connection type (usually "main") maps to an array of output arrays.
 * Each output array contains targets for that output index.
 */
export type N8nConnections = Record<string, N8nNodeConnections>;

export type N8nNodeConnections = Record<string, N8nConnectionTarget[][]>;

export interface N8nConnectionTarget {
  node: string;
  type: string;
  index: number;
}

export interface N8nWorkflowSettings {
  executionOrder?: string;
  callerPolicy?: string;
  errorWorkflow?: string;
  timezone?: string;
  saveDataSuccessExecution?: string;
  saveDataErrorExecution?: string;
  executionTimeout?: number;
}

/** Known n8n connection types */
export type N8nConnectionType =
  | 'main'
  | 'ai_languageModel'
  | 'ai_tool'
  | 'ai_memory'
  | 'ai_outputParser'
  | 'ai_embedding'
  | 'ai_vectorStore'
  | 'ai_document'
  | 'ai_textSplitter';

/** Node type prefixes */
export const NODE_PREFIX_BASE = 'n8n-nodes-base.';
export const NODE_PREFIX_LANGCHAIN = '@n8n/n8n-nodes-langchain.';

/** Simple nodes that compile to inline TypeScript */
export const INLINE_NODE_TYPES = new Set([
  'n8n-nodes-base.if',
  'n8n-nodes-base.set',
  'n8n-nodes-base.merge',
  'n8n-nodes-base.switch',
  'n8n-nodes-base.filter',
  'n8n-nodes-base.code',
  'n8n-nodes-base.noOp',
  'n8n-nodes-base.stickyNote',
  'n8n-nodes-base.manualTrigger',
]);

/** Nodes that are visual-only and should be skipped during compilation */
export const SKIP_NODE_TYPES = new Set([
  'n8n-nodes-base.stickyNote',
]);
