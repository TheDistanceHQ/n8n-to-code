# @n8n-to-code/executor

DAG-based workflow executor with parallel execution support. Runs compiled n8n workflows by walking the execution graph level-by-level, executing independent nodes concurrently when parallelism is enabled.

## Installation

```bash
npm install  # from the workspace root
```

## Usage

The executor is typically called by generated workflow code, but can be used directly:

```typescript
import { DagExecutor } from '@n8n-to-code/executor';
import type { WorkflowDag } from '@n8n-to-code/executor';
import { EnvCredentialProvider } from '@n8n-to-code/types';

const dag: WorkflowDag = {
  nodes: {
    'Trigger': { fn: triggerFn, isEntry: true, isMerge: false, outputCount: 1 },
    'Process': { fn: processFn, isEntry: false, isMerge: false, outputCount: 1 },
    'Save': { fn: saveFn, isEntry: false, isMerge: false, outputCount: 1 },
  },
  edges: [
    { source: 'Trigger', sourceOutput: 0, target: 'Process', targetInput: 0 },
    { source: 'Process', sourceOutput: 0, target: 'Save', targetInput: 0 },
  ],
  levels: [
    { level: 0, nodes: ['Trigger'] },
    { level: 1, nodes: ['Process'] },
    { level: 2, nodes: ['Save'] },
  ],
};

const executor = new DagExecutor(dag, {
  parallel: true,
  credentials: new EnvCredentialProvider(),
});

const results = await executor.run([{ json: { start: true } }]);
// results is a Map<string, DataItem[]> of all node outputs
```

## Execution Modes

### Parallel (default)

Nodes at the same level with no interdependencies execute concurrently via `Promise.allSettled()`:

```
Level 0: [Trigger]                    -- 1 node, runs alone
Level 1: [Fetch API, Read DB]         -- 2 nodes, run in PARALLEL
Level 2: [Merge Results]              -- 1 node, waits for both inputs
Level 3: [Format, Validate, Notify]   -- 3 nodes, run in PARALLEL
```

### Sequential

All nodes execute one at a time in topological order. Use when execution order matters or for debugging:

```typescript
const executor = new DagExecutor(dag, { parallel: false });
```

## Merge Node Handling

Merge nodes require inputs from multiple upstream branches. The executor uses a `MergeBuffer` to collect inputs per-slot and provides all inputs as a `DataItem[][]` (array of arrays, one per input slot) when the node executes.

```
Branch A ──> [slot 0] ──┐
                         ├──> Merge Node receives [[...slotA], [...slotB]]
Branch B ──> [slot 1] ──┘
```

## Cancellation

Pass an `AbortSignal` to cancel execution:

```typescript
const controller = new AbortController();

const executor = new DagExecutor(dag, {
  signal: controller.signal,
});

// Cancel after 30 seconds
setTimeout(() => controller.abort(), 30000);

try {
  await executor.run();
} catch (err) {
  // 'Workflow execution cancelled'
}
```

## Logging

Provide a custom logger implementing the `ILogger` interface:

```typescript
const executor = new DagExecutor(dag, {
  logger: {
    debug: (msg) => console.debug(msg),
    info: (msg) => console.info(msg),
    warn: (msg) => console.warn(msg),
    error: (msg) => console.error(msg),
  },
});
```

## Types

```typescript
export {
  DagExecutor,
  DagExecutorOptions,
  WorkflowDag,
  DagNode,
  DagEdge,
  DagLevel,
  NodeFunction,
  ExecutionContext,
} from '@n8n-to-code/executor';
```

### NodeFunction

The signature that generated node functions must satisfy:

```typescript
type NodeFunction = (
  input: DataItem[] | DataItem[][],  // DataItem[][] for merge nodes
  nodeOutputs: NodeOutputMap,         // all upstream outputs
  ctx?: ExecutionContext,
) => Promise<DataItem[][]>;           // array of outputs (one per output port)
```

### DagNode

```typescript
interface DagNode {
  fn: NodeFunction;   // the compiled node function
  isMerge: boolean;   // true if node has multiple input slots
  isEntry: boolean;   // true if node is a trigger or has no inputs
  outputCount: number; // number of output ports
}
```
