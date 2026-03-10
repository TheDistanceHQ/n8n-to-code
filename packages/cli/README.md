# @n8n-to-code/cli

Command-line interface for compiling n8n workflows into standalone TypeScript projects.

## Installation

From the monorepo root:

```bash
npm install
npm run build
```

The CLI is available as `n8n-to-code`:

```bash
npx n8n-to-code --help
```

Or link it globally:

```bash
npm link packages/cli
n8n-to-code --help
```

## Commands

### `compile`

Compile an n8n workflow JSON file into a TypeScript project.

```bash
n8n-to-code compile <workflow.json> [options]
```

**Arguments:**

- `<workflow.json>` -- path to an n8n workflow JSON file

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `-o, --output <dir>` | `./output` | Output directory for the generated project |
| `--parallel` | `true` | Enable parallel execution of independent branches |
| `--no-parallel` | | Disable parallel execution |

**Examples:**

```bash
# Compile with default settings
n8n-to-code compile my-workflow.json

# Compile to a specific directory
n8n-to-code compile my-workflow.json -o ./my-project

# Compile without parallel execution
n8n-to-code compile my-workflow.json --no-parallel
```

**Output:**

```
Compiling workflow: My Workflow Name
  Parsed 8 nodes (3 inline, 4 shimmed, 1 skipped)
  Built execution graph: 6 levels
  Written: package.json
  Written: tsconfig.json
  Written: src/workflow.ts
  Written: .env.example
  Written: __meta__.json
  Written: .gitignore
Done! Output written to ./output
```

### `update`

Update a previously compiled project when the source workflow changes. Only regenerates files for nodes that have changed.

```bash
n8n-to-code update <workflow.json> [options]
```

**Arguments:**

- `<workflow.json>` -- path to the updated n8n workflow JSON file

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `-d, --dir <dir>` | `./output` | Directory of the previously compiled project |

**Examples:**

```bash
# Update the default output directory
n8n-to-code update updated-workflow.json

# Update a specific project directory
n8n-to-code update updated-workflow.json -d ./my-project
```

**Output:**

```
Updating compiled project in ./my-project
  Changed nodes: HTTP Request, Set Fields
  Unchanged nodes: Trigger, If, Merge, Update Sheet
  Regenerating: src/workflow.ts
  Updated: __meta__.json
Done! 2 nodes updated, 4 unchanged.
```

## Workflow JSON

The input file should be a standard n8n workflow JSON export. You can obtain this by:

1. **Export from n8n UI** -- Open a workflow, click the three-dot menu, select "Download"
2. **n8n API** -- `GET /api/v1/workflows/{id}`
3. **n8n-mcp tools** -- Use the MCP protocol to fetch workflows programmatically

The JSON structure expected:

```json
{
  "name": "My Workflow",
  "nodes": [...],
  "connections": {...},
  "settings": {...}
}
```

## After Compilation

```bash
cd ./output

# Install dependencies
npm install

# Set up credentials
cp .env.example .env
# Edit .env with your actual credential values

# Build TypeScript
npm run build

# Run the workflow
npm start

# Or run directly with ts-node
npm run dev
```
