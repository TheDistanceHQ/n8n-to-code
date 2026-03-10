/**
 * End-to-end test: compile workflow and assert project shape.
 *
 * --- Test workflow (test-workflow.json): what it does ---
 *   Trigger → Wait1, Wait, Wait2, Wait3 (4 parallel branches) → Edit Fields x4 → Aggregate → Code in JavaScript
 *   Each branch waits then sets fields; Aggregate merges; Code runs on the single aggregated item.
 *
 * --- How to test the test workflow has executed correctly ---
 *   1. From repo root: node test-compile.mjs
 *   2. cd test-output && npm install && npm run build && npm start
 *   3. Correct execution: stdout shows "Workflow completed. Node outputs:" then one line per node, e.g.:
 *        When clicking 'Execute workflow': 1 items
 *        Wait1: 1 items
 *        ...
 *        Code in JavaScript: 1 items
 *   4. To assert programmatically: require the built workflow and call runWorkflow(); the returned
 *      Map must have entries for each node; summary["Code in JavaScript"] === 1, summary["Aggregate"] === 1.
 *   (The test that does this is skipped in CI because shimmed nodes require n8n-core at runtime.)
 */
import { compile } from './index.js';
import { loadFixture, loadTestWorkflow } from './__test-helpers__/factories.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const REPO_ROOT = join(__dirname, '../../..');
const E2E_OUTPUT_DIR = join(REPO_ROOT, 'test-output-e2e');
const E2E_TEST_WORKFLOW_DIR = join(REPO_ROOT, 'test-output-e2e-test-flow');

/** Runner script content: requires built workflow, runs it, prints JSON summary { nodeName: itemCount }. */
const RUN_AND_SUMMARY_SCRIPT = `
require('./dist/workflow.js').runWorkflow()
  .then((m) => {
    const s = Object.fromEntries([...m].map(([k, v]) => [k, v.length]));
    console.log(JSON.stringify(s));
  })
  .catch((e) => { console.error(e); process.exit(1); });
`;

describe('compile', () => {
  it('returns project files with package.json, tsconfig, src/workflow.ts, .env.example, __meta__.json, .gitignore', () => {
    const workflow = loadFixture('simple-workflow.json') as Parameters<typeof compile>[0];
    const project = compile(workflow, { parallel: true });
    const files = Object.fromEntries(project.files);
    expect(files['package.json']).toBeDefined();
    expect(files['tsconfig.json']).toBeDefined();
    expect(files['src/workflow.ts']).toBeDefined();
    expect(files['.env.example']).toBeDefined();
    expect(files['__meta__.json']).toBeDefined();
    expect(files['.gitignore']).toBeDefined();
  });

  it('generated workflow.ts contains DagExecutor and runWorkflow', () => {
    const workflow = loadFixture('simple-workflow.json') as Parameters<typeof compile>[0];
    const project = compile(workflow);
    const code = project.files.get('src/workflow.ts')!;
    expect(code).toContain('DagExecutor');
    expect(code).toContain('runWorkflow');
  });

  it('package.json uses file: for @n8n-to-code deps when monorepoRoot and outputDir provided', () => {
    const workflow = loadFixture('simple-workflow.json') as Parameters<typeof compile>[0];
    const project = compile(workflow, { monorepoRoot: '/repo', outputDir: '/repo/out' });
    const pkg = project.files.get('package.json')!;
    const json = JSON.parse(pkg);
    expect(json.dependencies['@n8n-to-code/types']).toMatch(/^file:/);
    expect(json.dependencies['@n8n-to-code/executor']).toMatch(/^file:/);
  });

  it('test compile with test-workflow.json (same as test-compile.mjs) succeeds and produces valid project', () => {
    const workflow = loadTestWorkflow() as Parameters<typeof compile>[0];
    expect(workflow.name).toBeDefined();
    expect(Array.isArray(workflow.nodes)).toBe(true);

    const project = compile(workflow, { parallel: true });
    expect(project.files.size).toBeGreaterThan(0);

    const code = project.files.get('src/workflow.ts')!;
    expect(code).toContain('DagExecutor');
    expect(code).toContain('runWorkflow');
    expect(code).toContain(workflow.name);

    const pkg = JSON.parse(project.files.get('package.json')!);
    expect(pkg.dependencies['@n8n-to-code/types']).toBeDefined();
    expect(pkg.dependencies['@n8n-to-code/executor']).toBeDefined();
  });

  it('writes generated project, installs, builds, runs dist/workflow.js, and execution completes successfully', () => {
    // Use simple workflow (no shimmed nodes) so npm install does not pull n8n-workflow
    const workflow = loadFixture('simple-workflow.json') as Parameters<typeof compile>[0];
    const project = compile(workflow, {
      parallel: true,
      monorepoRoot: REPO_ROOT,
      outputDir: E2E_OUTPUT_DIR,
    });

    for (const [relativePath, content] of project.files) {
      const fullPath = join(E2E_OUTPUT_DIR, relativePath);
      mkdirSync(fullPath.substring(0, fullPath.lastIndexOf('/')), { recursive: true });
      writeFileSync(fullPath, content, 'utf-8');
    }

    execSync('npm install', { cwd: E2E_OUTPUT_DIR, encoding: 'utf-8', timeout: 60_000 });
    execSync('npm run build', { cwd: E2E_OUTPUT_DIR, encoding: 'utf-8', timeout: 30_000 });

    const result = execSync('node dist/workflow.js', {
      cwd: E2E_OUTPUT_DIR,
      encoding: 'utf-8',
      timeout: 15_000,
    });

    expect(result).toContain('Workflow completed');
  });

  it.skip('test workflow: build, run runWorkflow(), assert output map (requires n8n-core; run test-output manually)', () => {
    // Shimmed nodes (Wait, etc.) require n8n-core at runtime. To verify the test workflow:
    //   node test-compile.mjs && cd test-output && npm install && npm run build && npm start
    // Correct execution prints "Workflow completed. Node outputs:" and lines like "  Code in JavaScript: 1 items".
    const workflow = loadTestWorkflow() as Parameters<typeof compile>[0];
    const project = compile(workflow, {
      parallel: true,
      monorepoRoot: REPO_ROOT,
      outputDir: E2E_TEST_WORKFLOW_DIR,
    });

    for (const [relativePath, content] of project.files) {
      const fullPath = join(E2E_TEST_WORKFLOW_DIR, relativePath);
      mkdirSync(fullPath.substring(0, fullPath.lastIndexOf('/')), { recursive: true });
      writeFileSync(fullPath, content, 'utf-8');
    }

    execSync('npm install', { cwd: E2E_TEST_WORKFLOW_DIR, encoding: 'utf-8', timeout: 120_000 });
    execSync('npm run build', { cwd: E2E_TEST_WORKFLOW_DIR, encoding: 'utf-8', timeout: 30_000 });

    writeFileSync(join(E2E_TEST_WORKFLOW_DIR, 'run-and-summary.cjs'), RUN_AND_SUMMARY_SCRIPT, 'utf-8');
    const stdout = execSync('node run-and-summary.cjs', {
      cwd: E2E_TEST_WORKFLOW_DIR,
      encoding: 'utf-8',
      timeout: 60_000,
    });

    const summary = JSON.parse(stdout.trim()) as Record<string, number>;
    expect(summary).toBeDefined();
    expect(typeof summary).toBe('object');
    expect(summary["When clicking 'Execute workflow'"]).toBe(1);
    expect(summary['Code in JavaScript']).toBe(1);
    expect(summary['Aggregate']).toBe(1);
    expect(summary['Edit Fields']).toBe(1);
  });
});
