/**
 * Generates a complete TypeScript project from a compiled workflow.
 * Emits package.json, tsconfig.json, .env.example, __meta__.json,
 * and the main workflow.ts file.
 */

import type { ParsedWorkflow, ParsedNode } from '../parser.js';
import type { GeneratedWorkflow } from './workflow.js';
import { createHash } from 'crypto';
import { relative, resolve, join } from 'path';

export interface ProjectFiles {
  /** Relative path -> file content */
  files: Map<string, string>;
}

export interface GenerateProjectOptions {
  workflowName: string;
  workflowId?: string;
  parallel?: boolean;
  /** Absolute path to the n8n-to-code monorepo root. Used to generate file: dependency paths. */
  monorepoRoot?: string;
  /** Absolute path to the output directory. Used with monorepoRoot to compute relative paths. */
  outputDir?: string;
}

/**
 * Generate all project files for a compiled workflow.
 */
export function generateProject(
  workflow: ParsedWorkflow,
  generatedWorkflow: GeneratedWorkflow,
  options: GenerateProjectOptions,
): ProjectFiles {
  const files = new Map<string, string>();

  // package.json
  files.set('package.json', generatePackageJson(workflow, generatedWorkflow, options));

  // tsconfig.json
  files.set('tsconfig.json', generateTsConfig());

  // Main workflow file
  files.set('src/workflow.ts', generatedWorkflow.code);

  // .env.example
  files.set('.env.example', generateEnvExample(workflow));

  // __meta__.json for re-parse/update
  files.set('__meta__.json', generateMeta(workflow, options));

  // .gitignore
  files.set('.gitignore', generateGitignore());

  return { files };
}

function generatePackageJson(
  workflow: ParsedWorkflow,
  generated: GeneratedWorkflow,
  options: GenerateProjectOptions,
): string {
  const safeName = options.workflowName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Compute dependency paths: use file: protocol for local monorepo packages
  const pkgPath = (pkgName: string): string => {
    if (options.monorepoRoot && options.outputDir) {
      const absPackageDir = join(options.monorepoRoot, 'packages', pkgName);
      const rel = relative(resolve(options.outputDir), absPackageDir);
      return `file:${rel}`;
    }
    // Fallback: assume output is a sibling of the monorepo (e.g. test-output/)
    return `file:../packages/${pkgName}`;
  };

  const deps: Record<string, string> = {
    '@n8n-to-code/types': pkgPath('types'),
    '@n8n-to-code/executor': pkgPath('executor'),
  };

  if (generated.usesShim) {
    deps['@n8n-to-code/context-shim'] = pkgPath('context-shim');
    deps['n8n-workflow'] = '*';
    deps['n8n-core'] = '*';
  }

  for (const pkg of generated.nodePackages) {
    deps[pkg] = '*';
  }

  const pkg = {
    name: `n8n-workflow-${safeName}`,
    version: '1.0.0',
    private: true,
    description: `Compiled n8n workflow: ${options.workflowName}`,
    main: 'dist/workflow.js',
    scripts: {
      build: 'tsc',
      start: 'node dist/workflow.js',
      dev: 'npx ts-node src/workflow.ts',
    },
    dependencies: deps,
    devDependencies: {
      typescript: '^5.4.0',
      '@types/node': '^20.0.0',
    },
  };

  return JSON.stringify(pkg, null, 2) + '\n';
}

function generateTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'Node16',
        moduleResolution: 'Node16',
        lib: ['ES2022'],
        outDir: 'dist',
        rootDir: 'src',
        declaration: true,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        resolveJsonModule: true,
      },
      include: ['src'],
    },
    null,
    2,
  ) + '\n';
}

function generateEnvExample(workflow: ParsedWorkflow): string {
  const lines = [
    `# Environment variables for workflow: ${workflow.name}`,
    `# Copy this file to .env and fill in the values.`,
    '',
    '# Credential configuration',
    '# Format: CRED_{TYPE}_{KEY}=value',
    '',
  ];

  // Collect all credential types used
  const credTypes = new Set<string>();
  for (const [, node] of workflow.nodes) {
    for (const [credType, credRef] of Object.entries(node.credentials)) {
      credTypes.add(credType);
      lines.push(`# ${credType} (${credRef.name})`);
      lines.push(`# CRED_${credType.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_APIKEY=`);
      lines.push('');
    }
  }

  if (credTypes.size === 0) {
    lines.push('# This workflow does not require any credentials.');
  }

  return lines.join('\n');
}

function generateMeta(
  workflow: ParsedWorkflow,
  options: GenerateProjectOptions,
): string {
  const nodes: Record<string, unknown> = {};

  for (const [name, node] of workflow.nodes) {
    const configStr = JSON.stringify({
      type: node.type,
      typeVersion: node.typeVersion,
      parameters: node.parameters,
      credentials: node.credentials,
    });

    nodes[name] = {
      type: node.type,
      typeVersion: node.typeVersion,
      configHash: hashString(configStr),
      compilationMode: node.compilationMode,
    };
  }

  const meta = {
    sourceWorkflowId: options.workflowId ?? null,
    sourceHash: hashString(JSON.stringify([...workflow.nodes.entries()])),
    generatedAt: new Date().toISOString(),
    parallel: options.parallel ?? true,
    nodes,
  };

  return JSON.stringify(meta, null, 2) + '\n';
}

function generateGitignore(): string {
  return `node_modules/
dist/
.env
*.js
*.d.ts
*.js.map
!tsconfig.json
`;
}

function hashString(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}
