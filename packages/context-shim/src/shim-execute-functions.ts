/**
 * ShimExecuteFunctions: implements enough of IExecuteFunctions
 * to allow real n8n node classes to execute outside of n8n.
 *
 * This is bound as `this` when calling node.execute().
 */

import type { ICredentialProvider } from '@n8n-to-code/types';
import { shimHelpers } from './shim-helpers.js';
import { ExpressionEvaluator } from './expression-evaluator.js';

/** Minimal node definition from the workflow JSON */
export interface ShimNodeDefinition {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
  disabled?: boolean;
  onError?: string;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
}

/** Minimal input data item */
export interface ShimInputData {
  json: Record<string, unknown>;
  binary?: Record<string, unknown>;
}

/**
 * Shim implementation of IExecuteFunctions.
 * Provides just enough context for n8n node execute() methods to work.
 */
export class ShimExecuteFunctions {
  private node: ShimNodeDefinition;
  private inputData: ShimInputData[];
  private credentialProvider: ICredentialProvider;
  private nodeOutputs: Map<string, ShimInputData[]>;
  private expressionEvaluator: ExpressionEvaluator;

  readonly helpers: ReturnType<typeof shimHelpers>;

  constructor(
    node: ShimNodeDefinition,
    inputData: ShimInputData[],
    credentialProvider: ICredentialProvider,
    nodeOutputs: Map<string, ShimInputData[]>,
  ) {
    this.node = node;
    this.inputData = inputData;
    this.credentialProvider = credentialProvider;
    this.nodeOutputs = nodeOutputs;
    this.expressionEvaluator = new ExpressionEvaluator(nodeOutputs);
    this.helpers = shimHelpers();
  }

  // --- Core methods used by most nodes ---

  getNodeParameter(
    parameterName: string,
    itemIndex: number,
    fallbackValue?: unknown,
    options?: { extractValue?: boolean },
  ): unknown {
    const rawValue = this.resolveParameter(parameterName);

    if (rawValue === undefined) {
      return fallbackValue;
    }

    // Evaluate expressions
    if (typeof rawValue === 'string' && rawValue.startsWith('=')) {
      const item = this.inputData[itemIndex] ?? { json: {} };
      return this.expressionEvaluator.evaluate(rawValue, item, itemIndex);
    }

    // Handle resource locator objects
    if (
      rawValue !== null &&
      typeof rawValue === 'object' &&
      '__rl' in (rawValue as Record<string, unknown>)
    ) {
      const rl = rawValue as Record<string, unknown>;
      const value = rl.value;
      if (typeof value === 'string' && value.startsWith('=')) {
        const item = this.inputData[itemIndex] ?? { json: {} };
        return this.expressionEvaluator.evaluate(value, item, itemIndex);
      }
      return value;
    }

    // Recursively resolve expressions in objects/arrays
    if (typeof rawValue === 'object' && rawValue !== null) {
      return this.resolveObjectExpressions(rawValue, itemIndex);
    }

    return rawValue;
  }

  async getCredentials<T = Record<string, unknown>>(
    type: string,
    _itemIndex?: number,
  ): Promise<T> {
    const credRef = this.node.credentials?.[type];
    const credName = credRef?.name ?? type;
    const creds = await this.credentialProvider.get(type, credName);
    return creds as T;
  }

  getInputData(inputIndex = 0, connectionType = 'main'): ShimInputData[] {
    return this.inputData;
  }

  continueOnFail(): boolean {
    return (
      this.node.onError === 'continueRegularOutput' ||
      this.node.onError === 'continueErrorOutput'
    );
  }

  getNode(): ShimNodeDefinition {
    return this.node;
  }

  getMode(): string {
    return 'regular';
  }

  getTimezone(): string {
    return 'UTC';
  }

  getWorkflow(): { id: string; name: string; active: boolean } {
    return { id: 'compiled', name: 'compiled-workflow', active: true };
  }

  // --- Expression evaluation ---

  evaluateExpression(expression: string, itemIndex: number): unknown {
    const item = this.inputData[itemIndex] ?? { json: {} };
    return this.expressionEvaluator.evaluate(expression, item, itemIndex);
  }

  // --- Stubbed methods ---

  sendMessageToUI(_message: unknown): void {
    // No-op outside n8n
  }

  async executeWorkflow(
    _workflowInfo: unknown,
    _inputData?: unknown,
  ): Promise<unknown> {
    throw new Error(
      'Sub-workflow execution is not yet supported in compiled workflows',
    );
  }

  async putExecutionToWait(_waitTill: Date): Promise<void> {
    throw new Error(
      'Wait/pause is not supported in compiled workflows',
    );
  }

  sendResponse(_response: unknown): void {
    // No-op
  }

  getExecuteData(): { node: ShimNodeDefinition } {
    return { node: this.node };
  }

  getInputSourceData(): unknown {
    return {};
  }

  getContext(_type: string): Record<string, unknown> {
    return {};
  }

  setMetadata(_metadata: unknown): void {
    // No-op
  }

  getWorkflowDataProxy(_itemIndex: number): Record<string, unknown> {
    return {};
  }

  logAiEvent(_eventName: string, _msg?: string): void {
    // No-op
  }

  getParentCallbackManager(): undefined {
    return undefined;
  }

  getExecutionCancelSignal(): AbortSignal | undefined {
    return undefined;
  }

  onExecutionCancellation(_handler: () => unknown): void {
    // No-op
  }

  addInputData(): { index: number } {
    return { index: 0 };
  }

  addOutputData(): void {
    // No-op
  }

  addExecutionHints(): void {
    // No-op
  }

  getNodeOutputs(): Array<{ type: string }> {
    return [{ type: 'main' }];
  }

  getNodeInputs(): Array<{ type: string }> {
    return [{ type: 'main' }];
  }

  getChildNodes(): string[] {
    return [];
  }

  getParentNodes(): string[] {
    return [];
  }

  getInputConnectionData(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  getExecutionDataById(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  startJob(): Promise<unknown> {
    throw new Error('Job runner not available in compiled workflows');
  }

  getRunnerStatus(): { available: false; reason: string } {
    return { available: false, reason: 'Not available in compiled workflows' };
  }

  isStreaming(): boolean {
    return false;
  }

  isToolExecution(): boolean {
    return false;
  }

  sendChunk(): void {
    // No-op
  }

  get nodeHelpers(): Record<string, Function> {
    return {};
  }

  // --- Private helpers ---

  private resolveParameter(name: string): unknown {
    // Wait node: exported workflows often omit "resume"/"unit"/"amount". Default to timeInterval with 0s so execution doesn't wait.
    if (this.node.type === 'n8n-nodes-base.wait' && this.node.parameters) {
      const params = this.node.parameters as Record<string, unknown>;
      if (name === 'resume' && params.resume === undefined) {
        return 'timeInterval';
      }
      if (name === 'unit' && params.unit === undefined) {
        return 'seconds';
      }
      if (name === 'amount' && params.amount === undefined) {
        return 0;
      }
    }

    // HTTP Request node: default authentication to 'none' so a request is always pushed (avoids responseData undefined).
    if (this.node.type === 'n8n-nodes-base.httpRequest' && name === 'authentication') {
      const params = this.node.parameters as Record<string, unknown>;
      if (params?.authentication === undefined) {
        return 'none';
      }
    }

    // Handle dotted paths: "options.someField"
    const parts = name.split('.');
    let current: unknown = this.node.parameters;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private resolveObjectExpressions(obj: unknown, itemIndex: number): unknown {
    if (typeof obj === 'string' && obj.startsWith('=')) {
      const item = this.inputData[itemIndex] ?? { json: {} };
      return this.expressionEvaluator.evaluate(obj, item, itemIndex);
    }

    if (Array.isArray(obj)) {
      return obj.map((v) => this.resolveObjectExpressions(v, itemIndex));
    }

    if (typeof obj === 'object' && obj !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        result[key] = this.resolveObjectExpressions(value, itemIndex);
      }
      return result;
    }

    return obj;
  }
}
