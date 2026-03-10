/**
 * Pluggable credential provider interface.
 * Allows credentials to be sourced from env vars, config files,
 * or external secret managers.
 */

export interface ICredentialProvider {
  /**
   * Retrieve credentials by type and name.
   * @param credentialType - The credential type (e.g., "openAiApi", "httpBasicAuth")
   * @param credentialName - The credential name from the workflow (e.g., "My OpenAI Key")
   * @returns The credential data as a key-value object
   */
  get(
    credentialType: string,
    credentialName: string,
  ): Promise<Record<string, unknown>>;
}

/**
 * Reads credentials from environment variables.
 * Convention: CRED_{TYPE}_{KEY} (e.g., CRED_OPENAIAPI_APIKEY)
 */
export class EnvCredentialProvider implements ICredentialProvider {
  async get(
    credentialType: string,
    _credentialName: string,
  ): Promise<Record<string, unknown>> {
    const prefix = `CRED_${credentialType.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_`;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix)) {
        const credKey = key.slice(prefix.length).toLowerCase();
        // Convert camelCase: API_KEY -> apiKey
        const camelKey = credKey.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        result[camelKey] = value;
      }
    }

    return result;
  }
}

/**
 * Reads credentials from a JSON config file.
 * Structure: { "credentialType:credentialName": { key: value, ... } }
 */
export class FileCredentialProvider implements ICredentialProvider {
  private credentials: Record<string, Record<string, unknown>> = {};

  constructor(filePath: string) {
    // Lazy-load the file on first access
    this._filePath = filePath;
  }

  private _filePath: string;
  private _loaded = false;

  private async ensureLoaded(): Promise<void> {
    if (this._loaded) return;
    const fs = await import('fs/promises');
    const content = await fs.readFile(this._filePath, 'utf-8');
    this.credentials = JSON.parse(content) as Record<string, Record<string, unknown>>;
    this._loaded = true;
  }

  async get(
    credentialType: string,
    credentialName: string,
  ): Promise<Record<string, unknown>> {
    await this.ensureLoaded();
    const key = `${credentialType}:${credentialName}`;
    return this.credentials[key] ?? {};
  }
}

/**
 * Tries multiple credential providers in order.
 * Returns the first non-empty result.
 */
export class ChainedCredentialProvider implements ICredentialProvider {
  private providers: ICredentialProvider[];

  constructor(...providers: ICredentialProvider[]) {
    this.providers = providers;
  }

  async get(
    credentialType: string,
    credentialName: string,
  ): Promise<Record<string, unknown>> {
    for (const provider of this.providers) {
      const result = await provider.get(credentialType, credentialName);
      if (Object.keys(result).length > 0) {
        return result;
      }
    }
    return {};
  }
}
