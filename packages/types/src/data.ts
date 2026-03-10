/**
 * Runtime data types for workflow execution.
 * These represent the data that flows between nodes.
 */

/** A single data item flowing through the workflow */
export interface DataItem {
  json: Record<string, unknown>;
  binary?: Record<string, BinaryData>;
  pairedItem?: PairedItem;
}

export interface PairedItem {
  item: number;
  input?: number;
}

export interface BinaryData {
  data: string; // base64 encoded
  mimeType: string;
  fileName?: string;
  fileSize?: number;
  fileExtension?: string;
}

/**
 * Output from a node execution.
 * Outer array = output index (e.g., [0]=true branch, [1]=false branch for IF nodes)
 * Inner array = items at that output
 */
export type NodeOutput = DataItem[][];

/**
 * Map of node name -> output items from that node.
 * Used to resolve expressions that reference upstream nodes.
 */
export type NodeOutputMap = Map<string, DataItem[]>;

/** Logger interface for execution output */
export interface ILogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** Execution context passed to node functions at runtime */
export interface ExecutionContext {
  credentials: import('./credentials.js').ICredentialProvider;
  nodeOutputs: NodeOutputMap;
  logger: ILogger;
  signal?: AbortSignal;
}
