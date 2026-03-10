# @n8n-to-code/types

Core type definitions and credential providers for the n8n-to-code project.

## Installation

This package is used internally by other `@n8n-to-code/*` packages. In the monorepo:

```bash
npm install  # from the workspace root
```

## Exports

### Workflow Types

```typescript
import {
  N8nWorkflow,       // Top-level workflow structure
  N8nNode,           // Individual node definition
  N8nConnections,    // Connection map between nodes
  N8nConnectionTarget, // Target of a connection (node + input index)
  INLINE_NODE_TYPES, // Set of node types compiled to native TS
  SKIP_NODE_TYPES,   // Set of node types skipped during compilation (e.g. sticky notes)
} from '@n8n-to-code/types';
```

### Data Types

```typescript
import {
  DataItem,       // { json: Record<string, unknown>; binary?: ... }
  BinaryData,     // Binary file data with mime type and metadata
  NodeOutput,     // DataItem[] -- output from a single node
  NodeOutputMap,  // Map<string, DataItem[]> -- all node outputs
  ILogger,        // Logging interface (debug, info, warn, error)
  ExecutionContext, // Runtime context passed to node functions
} from '@n8n-to-code/types';
```

### Credential Providers

```typescript
import {
  ICredentialProvider,       // Interface for credential retrieval
  EnvCredentialProvider,     // Reads from environment variables
  FileCredentialProvider,    // Reads from a JSON config file
  ChainedCredentialProvider, // Tries multiple providers in order
} from '@n8n-to-code/types';
```

## Credential Providers

### EnvCredentialProvider

Reads credentials from environment variables using the convention `CRED_{TYPE}_{KEY}`:

```bash
# .env
CRED_OPENAIAPI_APIKEY=sk-...
CRED_HTTPBASICAUTH_USER=admin
CRED_HTTPBASICAUTH_PASSWORD=secret
```

```typescript
const provider = new EnvCredentialProvider();
const creds = await provider.get('openAiApi', 'My OpenAI Key');
// { apikey: 'sk-...' }
```

### FileCredentialProvider

Reads from a JSON config file structured as `{ "type:name": { key: value } }`:

```json
{
  "openAiApi:My OpenAI Key": {
    "apiKey": "sk-..."
  },
  "httpBasicAuth:Admin Creds": {
    "user": "admin",
    "password": "secret"
  }
}
```

```typescript
const provider = new FileCredentialProvider('./credentials.json');
const creds = await provider.get('openAiApi', 'My OpenAI Key');
```

### ChainedCredentialProvider

Tries multiple providers in order, returning the first non-empty result:

```typescript
const provider = new ChainedCredentialProvider(
  new EnvCredentialProvider(),
  new FileCredentialProvider('./credentials.json'),
);
```

### Custom Provider

Implement the `ICredentialProvider` interface:

```typescript
class VaultCredentialProvider implements ICredentialProvider {
  async get(credentialType: string, credentialName: string) {
    // Fetch from HashiCorp Vault, AWS Secrets Manager, etc.
    return { apiKey: '...' };
  }
}
```
