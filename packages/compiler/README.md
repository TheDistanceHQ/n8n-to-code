# @n8n-to-code/compiler

Compiles n8n workflow JSON into standalone TypeScript projects. This is the core package that parses workflows, builds the execution graph, and generates code.

## Installation

```bash
npm install  # from the workspace root
```

## Usage

### High-Level API

```typescript
import { compile } from '@n8n-to-code/compiler';

const workflow = JSON.parse(fs.readFileSync('workflow.json', 'utf-8'));

const project = compile(workflow, {
  parallel: true,  // enable parallel execution (default: true)
});

// project.files is a Map<string, string> of relative paths to file content
for (const [path, content] of project.files) {
  // Write files to disk
  fs.writeFileSync(`./output/${path}`, content);
}
```

### Step-by-Step API

For more control, use the individual compilation stages:

```typescript
import {
  parseWorkflow,
  buildGraph,
  generateWorkflowCode,
  generateProject,
} from '@n8n-to-code/compiler';

// 1. Parse: convert n8n JSON to internal representation
const parsed = parseWorkflow(workflow);
// parsed.nodes, parsed.connections, parsed.name, parsed.id

// 2. Graph: build DAG with topological sort and parallel levels
const graph = buildGraph(parsed);
// graph.sortedNodes, graph.levels, graph.mergeNodes, graph.entryNodes

// 3. Code generation: produce TypeScript source
const generated = generateWorkflowCode(parsed, graph, { parallel: true });
// generated.code -- the workflow.ts content

// 4. Project scaffold: generate package.json, tsconfig, env template, etc.
const project = generateProject(parsed, generated, {
  workflowName: parsed.name,
  workflowId: parsed.id,
  parallel: true,
});
```

### Incremental Updates

When a workflow changes, diff against the previous compilation to determine what needs regenerating:

```typescript
import { diffWorkflow, applyUpdates } from '@n8n-to-code/compiler';

const metaFile = JSON.parse(fs.readFileSync('./__meta__.json', 'utf-8'));
const diff = diffWorkflow(newWorkflow, metaFile);
// diff.added, diff.removed, diff.changed, diff.unchanged, diff.connectionsChanged

const updates = applyUpdates(diff);
// updates.filesToRegenerate, updates.filesToDelete
```

## Compilation Pipeline

### 1. Parser (`parser.ts`)

Converts raw n8n JSON into a `ParsedWorkflow` with classified nodes:

- **inline** -- simple nodes (If, Set, Merge, Switch, Filter, Code, NoOp) compiled to native TypeScript
- **shimmed** -- complex nodes executed via real n8n-nodes-base classes through the context shim
- **skip** -- non-executable nodes (Sticky Notes) excluded from output

### 2. Graph Builder (`graph.ts`)

Builds a directed acyclic graph (DAG) from the parsed workflow:

- Topological sort via Kahn's algorithm
- Parallel level computation -- nodes at the same level with no interdependencies can run concurrently
- Merge node detection for coordinated multi-input handling
- Entry node identification (triggers and nodes with no inputs)

### 3. Expression Compiler (`expression.ts`)

Compiles n8n expressions to TypeScript at code-generation time:

| n8n Expression | Generated TypeScript |
|---|---|
| `={{ $json.field }}` | `item.json.field` |
| `={{ $json.nested.deep }}` | `item.json?.nested?.deep` |
| `={{ $('NodeName').item.json.x }}` | `nodeOutputs.get('NodeName')![itemIndex].json.x` |
| `={{ $json.count > 5 }}` | `(item.json.count as number) > 5` |
| Mixed text: `Hello {{ $json.name }}!` | `` `Hello ${item.json.name}!` `` |

### 4. Code Generators

#### Inline Generators (`codegen/inline/`)

Each simple node type has a dedicated code generator:

- **`if.ts`** -- conditional branching with support for string, number, boolean, dateTime, and array operators
- **`set.ts`** -- field assignment supporting both v3.x (`fields.values`) and v3.3+ (`assignments.assignments`) parameter formats
- **`merge.ts`** -- append, combine-by-position, and combine-by-fields operations
- **`switch.ts`** -- multi-output routing with rules and expression modes
- **`filter.ts`** -- item filtering with conditions
- **`code.ts`** -- inline JavaScript with `$input`/`$json` bindings (runOnceForAllItems and runOnceForEachItem)
- **`noop.ts`** -- pass-through

#### Shimmed Generator (`codegen/shimmed.ts`)

Generates code that dynamically imports the real n8n node class and executes it through the context shim:

```typescript
// Example generated code for an HTTP Request node:
import { HttpRequest } from 'n8n-nodes-base/dist/nodes/HttpRequest/HttpRequest.node';

const nodeInstance = new HttpRequest();
const shim = new ShimExecuteFunctions(nodeDefinition, input, ctx);
const result = await nodeInstance.execute.call(shim);
```

### 5. Project Generator (`codegen/project.ts`)

Produces the full project scaffold:

- `package.json` with correct dependencies based on which nodes are shimmed
- `tsconfig.json` for TypeScript compilation
- `.env.example` documenting required credential environment variables
- `__meta__.json` tracking per-node content hashes for incremental updates
- `.gitignore`

## Exports

```typescript
// Main entry point
export { compile, CompileOptions } from '@n8n-to-code/compiler';

// Individual stages
export { parseWorkflow, ParsedWorkflow, ParsedNode, Edge } from '@n8n-to-code/compiler';
export { buildGraph, WorkflowGraph, ExecutionLevel, AdjacencyEntry } from '@n8n-to-code/compiler';
export { generateWorkflowCode, GeneratedWorkflow } from '@n8n-to-code/compiler';
export { generateProject, ProjectFiles, GenerateProjectOptions } from '@n8n-to-code/compiler';

// Utilities
export { compileExpression, isExpression, sanitizeNodeName } from '@n8n-to-code/compiler';
export { diffWorkflow, applyUpdates, WorkflowDiff } from '@n8n-to-code/compiler';
```
