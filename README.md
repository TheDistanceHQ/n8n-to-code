# n8n-to-code

Convert n8n workflows into standalone, compiled TypeScript projects that run outside the n8n framework with native performance and optional parallel execution.

## Why?

n8n workflows run inside a no-code runtime with inherent overhead: expression parsing via string interpolation, node lookup indirection, JSON serialization between steps, and single-threaded sequential execution. **n8n-to-code** compiles workflow JSON into standalone TypeScript that:

- Eliminates framework overhead by compiling expressions and simple nodes to native TypeScript
- Enables parallel execution of independent branches via `Promise.allSettled()`
- Produces version-controllable code that can be reviewed, tested, and deployed independently
- Supports incremental updates when the source workflow changes

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  n8n JSON    │────>│   Compiler   │────>│  Generated TS   │
│  (file/MCP)  │     │              │     │  Project        │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                   │
                    ┌──────────────┐               │ imports
                    │  Executor    │<──────────────┘
                    │  (DAG runner)│
                    └──────┬───────┘
                           │ uses
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴──────┐ ┌──┴────┐ ┌────┴─────────┐
        │ Context    │ │ Cred  │ │ n8n-nodes-   │
        │ Shim       │ │Provider│ │ base (npm)   │
        │(IExecute   │ └───────┘ └──────────────┘
        │ Functions) │
        └────────────┘
```

### Two Compilation Modes

1. **Inline** (simple nodes) -- If, Set, Merge, Switch, Filter, Code, NoOp are compiled to native TypeScript with zero n8n dependency at runtime.

2. **Shimmed** (complex nodes) -- All other nodes (HTTP Request, Google Sheets, Slack, etc.) import the real node class from `n8n-nodes-base` and execute it through an `IExecuteFunctions` context shim. All 304+ built-in n8n nodes work immediately without reimplementation.

## Quick Start

### Prerequisites

- Node.js >= 18
- An n8n workflow JSON file (exported from n8n or fetched via MCP)

### Installation

```bash
git clone <repo-url>
cd n8n-to-code
npm install
npm run build
```

### Compile a Workflow

```bash
# Using the CLI
npx n8n-to-code compile workflow.json -o ./my-project

# Or programmatically
node -e "
  const { compile } = require('./packages/compiler');
  const workflow = require('./workflow.json');
  const project = compile(workflow, { parallel: true });
  // project.files is a Map<string, string> of file paths to content
"
```

### Run the Generated Project

```bash
cd my-project
npm install

# Configure credentials (copy and fill in values)
cp .env.example .env

# Build and run
npm run build
npm start

# Or run directly with ts-node
npm run dev
```

### Update an Existing Project

When the source workflow changes, update the compiled project incrementally:

```bash
npx n8n-to-code update updated-workflow.json -d ./my-project
```

Only changed nodes are regenerated. The `__meta__.json` file tracks per-node content hashes to determine what needs updating.

## CLI Reference

```
n8n-to-code compile <workflow.json> [options]
  -o, --output <dir>    Output directory (default: ./output)
  --parallel            Enable parallel execution (default: true)
  --no-parallel         Disable parallel execution

n8n-to-code update <workflow.json> [options]
  -d, --dir <dir>       Compiled project directory (default: ./output)
```

## Generated Project Structure

```
my-project/
├── package.json          # Dependencies (n8n-nodes-base for shimmed nodes)
├── tsconfig.json         # TypeScript configuration
├── .env.example          # Credential environment variables template
├── .gitignore
├── __meta__.json         # Compilation metadata (hashes for incremental updates)
└── src/
    └── workflow.ts       # Complete executable workflow
```

The generated `workflow.ts` contains:

- **Node functions** -- one async function per workflow node
- **DAG definition** -- nodes, edges, and parallel execution levels
- **`runWorkflow()` export** -- entry point that executes the full workflow

## Credentials

Generated projects use a pluggable credential system. The default `EnvCredentialProvider` reads from environment variables:

```bash
# Convention: CRED_{TYPE}_{KEY}=value
CRED_OPENAIAPI_APIKEY=sk-...
CRED_GOOGLESHEETSOAUTH2API_ACCESSTOKEN=ya29...
```

Alternative providers:

- **`FileCredentialProvider`** -- reads from a JSON file
- **`ChainedCredentialProvider`** -- tries multiple providers in order
- **Custom** -- implement the `ICredentialProvider` interface

## Parallel Execution

The compiler performs topological sorting on the workflow DAG to identify independent branches. Nodes at the same execution level with no interdependencies run concurrently via `Promise.allSettled()`.

Example for a workflow with branching after a conditional:

```
Level 0: [Schedule Trigger]              -- sequential
Level 1: [Get Google Sheet]              -- sequential
Level 2: [Conditional Check]             -- sequential
Level 3: [HTTP Request, No Operation]    -- PARALLEL
Level 4: [Data Merge]                    -- sequential (waits for both inputs)
Level 5: [Field Editing]                 -- sequential
Level 6: [Update Sheet]                  -- sequential
```

Disable with `--no-parallel` if sequential execution is preferred.

## Monorepo Packages

| Package | Description |
|---------|-------------|
| [`@n8n-to-code/types`](./packages/types) | Core type definitions, credential providers |
| [`@n8n-to-code/compiler`](./packages/compiler) | Workflow JSON to TypeScript compiler |
| [`@n8n-to-code/context-shim`](./packages/context-shim) | `IExecuteFunctions` shim for running n8n nodes standalone |
| [`@n8n-to-code/executor`](./packages/executor) | DAG-based workflow executor with parallel support |
| [`@n8n-to-code/cli`](./packages/cli) | Command-line interface |

## Supported Nodes

### Inline (compiled to native TypeScript)

- **If** -- conditional branching with string/number/boolean/dateTime/array operators
- **Set** -- field assignment and transformation (v3.x and v3.3+ parameter formats)
- **Merge** -- append, combine by position, combine by fields
- **Switch** -- multi-branch routing with rules
- **Filter** -- item filtering with conditions
- **Code** -- inline JavaScript execution
- **NoOp** -- pass-through

### Shimmed (executed via real n8n node classes)

All other n8n-nodes-base nodes are supported automatically through the context shim, including:

- HTTP Request, Webhook
- Google Sheets, Gmail, Google Drive
- Slack, Discord, Telegram
- PostgreSQL, MySQL, MongoDB
- OpenAI, Anthropic (and all LangChain nodes in Phase 2)
- All 304+ built-in nodes

## Roadmap

- [ ] MCP integration for fetching workflows directly from n8n
- [ ] AI/LangChain nodes compiled to Vercel AI SDK calls
- [ ] Python Code node support
- [ ] Sub-workflow execution
- [ ] Binary data handling improvements
- [ ] Additional credential providers (AWS Secrets Manager, HashiCorp Vault)

## Development

```bash
# Build all packages
npm run build

# Type-check without emitting
npm run typecheck

# Clean build artifacts
npm run clean
```

## License

ISC
