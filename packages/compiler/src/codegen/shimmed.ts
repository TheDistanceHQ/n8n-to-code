/**
 * Code generator for shimmed nodes -- nodes that use the real n8n node class
 * via our IExecuteFunctions context shim.
 */

import type { ParsedNode } from '../parser.js';
import { sanitizeNodeName } from '../expression.js';

/**
 * Generate code that invokes a real n8n node via the context shim.
 */
export function generateShimmedNode(node: ParsedNode): string {
  const fnName = `node_${sanitizeNodeName(node.name)}`;
  const importPath = getNodeImportPath(node.type);
  const className = getNodeClassName(node.type);

  return `
/**
 * ${node.name}
 * Shimmed execution via real n8n node: ${node.type} v${node.typeVersion}
 */
async function ${fnName}(
  input: DataItem[] | DataItem[][],
  nodeOutputs: NodeOutputMap,
  ctx?: ExecutionContext,
): Promise<DataItem[][]> {
  const items = normalizeInput(input);
  if (!ctx) throw new Error('ExecutionContext required for shimmed node');
  const nodeDefinition = ${JSON.stringify({
    id: node.id,
    name: node.name,
    type: node.type,
    typeVersion: node.typeVersion,
    parameters: node.parameters,
    credentials: node.credentials,
    disabled: node.disabled,
    onError: node.onError,
    retryOnFail: node.retryOnFail,
    maxTries: node.maxTries,
    waitBetweenTries: node.waitBetweenTries,
  }, null, 2)};

  return await executeShimmedNode(
    '${importPath}',
    '${className}',
    ${node.typeVersion},
    nodeDefinition,
    items.map(item => ({ json: item.json, binary: item.binary })),
    ctx,
  );
}`;
}

/**
 * Generate the shared shimmed execution helper function.
 * This is included once in the generated workflow file.
 */
export function generateShimmedHelper(): string {
  return `
/**
 * Execute a real n8n node via the context shim.
 * Dynamically imports the node class and calls execute() with our shim context.
 */
async function executeShimmedNode(
  importPath: string,
  className: string,
  typeVersion: number,
  nodeDefinition: Record<string, unknown>,
  inputData: Array<{ json: Record<string, unknown>; binary?: Record<string, unknown> }>,
  ctx: ExecutionContext,
): Promise<DataItem[][]> {
  // Dynamic import of the n8n node
  const nodeModule = await import(importPath);
  const NodeClass = nodeModule[className] ?? nodeModule.default;

  if (!NodeClass) {
    throw new Error(\`Could not find node class \${className} in \${importPath}\`);
  }

  const nodeInstance = new NodeClass();

  // Handle versioned nodes
  let executor: { execute: Function } | undefined;
  if ('nodeVersions' in nodeInstance && typeof nodeInstance.nodeVersions === 'object') {
    // VersionedNodeType -- find the right version
    const versions = nodeInstance.nodeVersions as Record<number, { execute: Function }>;
    executor = versions[typeVersion] ?? versions[Math.floor(typeVersion)];
  } else if ('execute' in nodeInstance) {
    executor = nodeInstance;
  }

  if (!executor?.execute) {
    throw new Error(\`Node \${className} v\${typeVersion} does not have an execute method\`);
  }

  // Create the context shim
  const shim = new ShimExecuteFunctions(
    nodeDefinition as any,
    inputData as any,
    ctx.credentials,
    ctx.nodeOutputs as any,
  );

  // Nodes use either execute(context) with context as 1st param, or execute() with context as 'this'
  const result =
    executor.execute.length >= 1
      ? await executor.execute.call(executor, shim)
      : await executor.execute.call(shim);

  if (!result) return [[]];

  // Normalize the result to DataItem[][]
  return (result as unknown[][]).map((outputItems: unknown[]) =>
    (outputItems as Array<{ json: Record<string, unknown>; binary?: Record<string, unknown> }>).map(item => ({
      json: item.json ?? {},
      binary: item.binary as DataItem['binary'],
    }))
  );
}`;
}

/**
 * Node types that live in a subfolder of dist/nodes/ (e.g. Transform/Aggregate).
 * Map: node type -> path suffix under n8n-nodes-base/dist/nodes/
 */
const N8N_NODES_BASE_SUBFOLDER_PATHS: Record<string, string> = {
  'n8n-nodes-base.aggregate': 'Transform/Aggregate/Aggregate.node.js',
};

/**
 * Map an n8n node type to its import path in n8n-nodes-base.
 */
function getNodeImportPath(nodeType: string): string {
  // n8n-nodes-base.httpRequest -> n8n-nodes-base/dist/nodes/HttpRequest/HttpRequest.node
  // n8n-nodes-base.aggregate -> n8n-nodes-base/dist/nodes/Transform/Aggregate/Aggregate.node.js

  if (nodeType.startsWith('n8n-nodes-base.')) {
    const subPath = N8N_NODES_BASE_SUBFOLDER_PATHS[nodeType];
    if (subPath) {
      return `n8n-nodes-base/dist/nodes/${subPath}`;
    }
    const shortName = nodeType.replace('n8n-nodes-base.', '');
    const className = shortName.charAt(0).toUpperCase() + shortName.slice(1);
    return `n8n-nodes-base/dist/nodes/${className}/${className}.node.js`;
  }

  if (nodeType.startsWith('@n8n/n8n-nodes-langchain.')) {
    const shortName = nodeType.replace('@n8n/n8n-nodes-langchain.', '');
    const className = shortName.charAt(0).toUpperCase() + shortName.slice(1);
    return `@n8n/n8n-nodes-langchain/dist/nodes/${className}/${className}.node.js`;
  }

  // Community nodes
  return nodeType.replace('.', '/dist/nodes/');
}

/**
 * Map an n8n node type to its class name.
 */
function getNodeClassName(nodeType: string): string {
  const parts = nodeType.split('.');
  const shortName = parts[parts.length - 1];
  return shortName.charAt(0).toUpperCase() + shortName.slice(1);
}

/**
 * Get the npm package name for a node type.
 */
export function getNodePackageName(nodeType: string): string {
  if (nodeType.startsWith('n8n-nodes-base.')) {
    return 'n8n-nodes-base';
  }
  if (nodeType.startsWith('@n8n/n8n-nodes-langchain.')) {
    return '@n8n/n8n-nodes-langchain';
  }
  // Community node: n8n-nodes-custom.something -> n8n-nodes-custom
  return nodeType.split('.')[0];
}
