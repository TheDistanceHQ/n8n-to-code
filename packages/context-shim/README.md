# @n8n-to-code/context-shim

An `IExecuteFunctions` context shim that enables real n8n node classes to execute outside the n8n framework. This is the critical bridge that allows all 304+ built-in n8n nodes to work in compiled projects without reimplementing any node logic.

## How It Works

n8n nodes implement the `INodeType` interface with an `execute()` method. During execution, nodes call methods on a context object (`this` inside `execute()`) that satisfies `IExecuteFunctions` -- providing access to parameters, credentials, input data, HTTP helpers, and more.

The `ShimExecuteFunctions` class provides this context outside n8n, delegating to pluggable credential providers and using standard HTTP libraries instead of n8n's internal request infrastructure.

```
┌──────────────────┐       ┌───────────────────────┐
│  n8n Node Class   │──────>│  ShimExecuteFunctions  │
│  (from npm)       │ this  │                        │
│                   │       │  getNodeParameter()    │
│  execute() {      │       │  getCredentials()      │
│    this.get...()  │       │  getInputData()        │
│  }                │       │  helpers.httpRequest()  │
└──────────────────┘       └───────────┬───────────┘
                                       │
                           ┌───────────┴───────────┐
                           │  ICredentialProvider   │
                           │  (env, file, vault...) │
                           └───────────────────────┘
```

## Installation

```bash
npm install  # from the workspace root
```

## Usage

```typescript
import { ShimExecuteFunctions } from '@n8n-to-code/context-shim';
import { EnvCredentialProvider } from '@n8n-to-code/types';

// The node definition from the workflow JSON
const nodeDefinition = {
  name: 'HTTP Request',
  type: 'n8n-nodes-base.httpRequest',
  parameters: {
    url: 'https://api.example.com/data',
    method: 'GET',
  },
  credentials: {
    httpBasicAuth: { name: 'My API Creds' },
  },
};

const shim = new ShimExecuteFunctions(
  nodeDefinition,
  inputItems,              // DataItem[] flowing into this node
  new EnvCredentialProvider(),
  nodeOutputs,             // Map of upstream node outputs (for expression resolution)
);

// Execute the real n8n node
const GoogleSheets = require('n8n-nodes-base/dist/nodes/Google/Sheet/GoogleSheets.node').GoogleSheets;
const node = new GoogleSheets();
const result = await node.execute.call(shim);
```

## Implemented IExecuteFunctions Methods

### Core Methods (fully implemented)

| Method | Description |
|--------|-------------|
| `getNodeParameter(name, itemIndex, fallback?)` | Reads from node parameters, evaluates expressions |
| `getCredentials(type)` | Delegates to the pluggable credential provider |
| `getInputData()` | Returns the input items array |
| `continueOnFail()` | Reads the node's `onError` configuration |
| `evaluateExpression(expr, itemIndex)` | Runtime expression evaluation |
| `getNode()` | Returns the node definition |
| `getWorkflow()` | Returns a minimal workflow descriptor |

### Helpers (fully implemented)

| Helper | Description |
|--------|-------------|
| `helpers.request(options)` | HTTP requests via axios |
| `helpers.httpRequest(options)` | Simplified HTTP helper |
| `helpers.httpRequestWithAuthentication(type, options)` | Authenticated HTTP |
| `helpers.returnJsonArray(data)` | Wraps raw objects as `DataItem[]` |
| `helpers.constructExecutionMetaData(items, opts)` | Pairs items with metadata |
| `helpers.prepareBinaryData(buffer, filename, mimeType)` | Creates binary data objects |
| `helpers.getBinaryDataBuffer(item, propertyName)` | Retrieves binary buffers |

### Stubbed Methods (no-op or throw)

These methods are called rarely and are safe to stub for standalone execution:

- `sendMessageToUI()` -- no-op (no UI in standalone mode)
- `executeWorkflow()` -- throws (sub-workflows not yet supported)
- `putExecutionToWait()` -- throws (wait nodes not yet supported)
- `getParentCallbackManager()` -- returns undefined (AI nodes, Phase 2)

## Expression Evaluation

The shim includes a runtime expression evaluator for shimmed nodes. Since n8n nodes call `getNodeParameter()` internally, expressions like `={{ $json.field }}` are resolved at runtime:

```typescript
import { ExpressionEvaluator } from '@n8n-to-code/context-shim';

const evaluator = new ExpressionEvaluator(inputItems, nodeOutputs);
const result = evaluator.evaluate('={{ $json.email }}', 0);
// Returns the email field from item at index 0
```

Supported expression variables:

- `$json` -- current item's JSON data
- `$input` -- input items accessor
- `$binary` -- current item's binary data
- `$('NodeName')` -- upstream node output accessor
- `$itemIndex` -- current item index
- Standard JavaScript expressions and operators

## Exports

```typescript
export { ShimExecuteFunctions } from '@n8n-to-code/context-shim';
export type { ShimNodeDefinition, ShimInputData } from '@n8n-to-code/context-shim';
export { ExpressionEvaluator } from '@n8n-to-code/context-shim';
export { shimHelpers } from '@n8n-to-code/context-shim';
```
