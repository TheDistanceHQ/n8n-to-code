/**
 * Shim implementations of the n8n helper functions.
 * These provide HTTP request capabilities, binary data handling,
 * and utility functions that n8n nodes rely on.
 */

import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

export function shimHelpers() {
  return {
    /**
     * Make an HTTP request (legacy helper used by many nodes).
     * HTTP Request V3 expects { body, headers, statusCode, statusMessage }.
     */
    request: async (options: Record<string, unknown>): Promise<unknown> => {
      const config = convertToAxiosConfig(options);
      const response = await axios(config);
      return fullResponseShape(response);
    },

    /**
     * Make an HTTP request with full response (v2 helper).
     */
    httpRequest: async (options: Record<string, unknown>): Promise<unknown> => {
      const config: AxiosRequestConfig = {
        url: options.url as string,
        method: (options.method as string ?? 'GET').toUpperCase(),
        headers: options.headers as Record<string, string> | undefined,
        data: options.body,
        params: options.qs as Record<string, string> | undefined,
        timeout: (options.timeout as number) ?? 300000,
        responseType: (options.encoding as string) === 'arraybuffer' ? 'arraybuffer' : 'json',
      };

      if (options.json === false) {
        config.transformResponse = [(data: string) => data];
      }

      if (options.returnFullResponse) {
        const response = await axios(config);
        return {
          body: response.data,
          headers: response.headers,
          statusCode: response.status,
          statusMessage: response.statusText,
        };
      }

      const response = await axios(config);
      return response.data;
    },

    /**
     * HTTP request with auto-pagination support.
     */
    httpRequestWithAuthentication: async (
      credentialsType: string,
      options: Record<string, unknown>,
      _additionalCredentialOptions?: Record<string, unknown>,
    ): Promise<unknown> => {
      // For now, just make the request -- credentials should already be applied
      const config: AxiosRequestConfig = {
        url: options.url as string,
        method: (options.method as string ?? 'GET').toUpperCase(),
        headers: options.headers as Record<string, string> | undefined,
        data: options.body,
        params: options.qs as Record<string, string> | undefined,
      };
      const response = await axios(config);
      return response.data;
    },

    /**
     * Convert data to n8n item format.
     */
    returnJsonArray: (data: unknown): Array<{ json: Record<string, unknown> }> => {
      if (Array.isArray(data)) {
        return data.map((item: unknown) => {
          if (typeof item === 'object' && item !== null && 'json' in item) {
            return item as { json: Record<string, unknown> };
          }
          return { json: item as Record<string, unknown> };
        });
      }
      if (typeof data === 'object' && data !== null) {
        return [{ json: data as Record<string, unknown> }];
      }
      return [{ json: { value: data } }];
    },

    /**
     * Construct execution metadata for paired items.
     */
    constructExecutionMetaData: (
      items: Array<{ json: Record<string, unknown> }>,
      options: { itemData?: { item: number } },
    ): Array<{ json: Record<string, unknown>; pairedItem?: { item: number } }> => {
      return items.map((item) => ({
        ...item,
        pairedItem: options.itemData,
      }));
    },

    /**
     * Prepare items for binary data operations.
     */
    prepareBinaryData: async (
      data: Buffer | string,
      fileName?: string,
      mimeType?: string,
    ): Promise<Record<string, unknown>> => {
      const buffer = typeof data === 'string' ? Buffer.from(data) : data;
      return {
        data: buffer.toString('base64'),
        mimeType: mimeType ?? 'application/octet-stream',
        fileName: fileName ?? 'file',
        fileSize: buffer.length,
      };
    },

    /**
     * Get binary data as buffer.
     */
    getBinaryDataBuffer: async (
      itemIndex: number,
      propertyName: string,
      inputData?: Array<{ binary?: Record<string, { data: string }> }>,
    ): Promise<Buffer> => {
      const item = inputData?.[itemIndex];
      const binaryData = item?.binary?.[propertyName];
      if (!binaryData?.data) {
        throw new Error(`No binary data found for property "${propertyName}" at index ${itemIndex}`);
      }
      return Buffer.from(binaryData.data, 'base64');
    },

    /**
     * Convert body (string, Buffer, ArrayBuffer, etc.) to Buffer. Used by HTTP Request V3 buffer-decoding.
     */
    binaryToBuffer: async (body: unknown): Promise<Buffer> => {
      if (body instanceof Buffer) return body;
      if (typeof body === 'string') return Buffer.from(body, 'utf-8');
      if (body instanceof ArrayBuffer) return Buffer.from(body);
      if (body instanceof Uint8Array) return Buffer.from(body);
      if (typeof body === 'object' && body !== null && Buffer.isBuffer(body)) return body as Buffer;
      return Buffer.from(String(body), 'utf-8');
    },

    /**
     * Decode buffer to string with optional encoding. Used by HTTP Request V3 buffer-decoding.
     */
    binaryToString: async (buffer: Buffer, encoding?: string): Promise<string> => {
      return encoding ? buffer.toString(encoding as BufferEncoding) : buffer.toString('utf-8');
    },

    /**
     * Simple encoding detection for buffer. Used by HTTP Request V3 buffer-decoding.
     */
    detectBinaryEncoding: (buffer: Buffer): string => {
      return 'utf-8';
    },

    /**
     * Assert binary data exists.
     */
    assertBinaryData: (
      itemIndex: number,
      propertyName: string,
    ): { data: string; mimeType: string; fileName?: string } => {
      throw new Error(`Binary data assertion not fully supported in shim mode`);
    },

    /**
     * Request with authentication (OAuth, API Key, etc.)
     * Returns full response shape for HTTP Request V3 node.
     */
    requestWithAuthentication: async (
      credentialsType: string,
      options: Record<string, unknown>,
      _additionalCredentialOptions?: Record<string, unknown>,
    ): Promise<unknown> => {
      const config = convertToAxiosConfig(options);
      const response = await axios(config);
      return fullResponseShape(response);
    },

    /**
     * Request with authentication and pagination (HTTP Request node).
     * Delegates to a single request; full pagination not implemented in shim.
     * Returns full response shape for V3 node.
     */
    requestWithAuthenticationPaginated: async (
      options: Record<string, unknown>,
      _itemIndex: number,
      _paginationData?: Record<string, unknown>,
      _nodeCredentialType?: string,
      _genericCredentialType?: string,
    ): Promise<unknown> => {
      const config = convertToAxiosConfig(options);
      const response = await axios(config);
      return fullResponseShape(response);
    },

    /**
     * OAuth1 request (HTTP Request node).
     */
    requestOAuth1: async (
      _credentialType: string,
      options: Record<string, unknown>,
    ): Promise<unknown> => {
      const config = convertToAxiosConfig(options);
      const response = await axios(config);
      return fullResponseShape(response);
    },

    /**
     * OAuth2 request (HTTP Request node).
     */
    requestOAuth2: async (
      _credentialType: string,
      options: Record<string, unknown>,
      _opts?: { tokenType?: string },
    ): Promise<unknown> => {
      const config = convertToAxiosConfig(options);
      const response = await axios(config);
      return fullResponseShape(response);
    },

    /**
     * Copy binary data between items.
     */
    copyInputItems: (
      items: Array<{ json: Record<string, unknown>; binary?: Record<string, unknown> }>,
      _properties: string[],
    ): Array<{ json: Record<string, unknown>; binary?: Record<string, unknown> }> => {
      return items.map((item) => ({ json: { ...item.json }, binary: item.binary }));
    },
  };
}

function convertToAxiosConfig(options: Record<string, unknown>): AxiosRequestConfig {
  return {
    url: (options.uri ?? options.url) as string,
    method: (options.method as string ?? 'GET').toUpperCase(),
    headers: options.headers as Record<string, string> | undefined,
    data: options.body,
    params: options.qs as Record<string, string> | undefined,
    timeout: (options.timeout as number) ?? 300000,
    responseType: options.encoding === 'arraybuffer' ? 'arraybuffer' : undefined,
    ...(options.json === false
      ? { transformResponse: [(data: string) => data] }
      : {}),
  };
}

/** HTTP Request V3 node expects { body, headers, statusCode, statusMessage }. */
function fullResponseShape(response: AxiosResponse): Record<string, unknown> {
  const headers = response.headers;
  const headersObj =
    headers && typeof headers === 'object' && !Array.isArray(headers)
      ? { ...headers } as Record<string, string>
      : {};
  return {
    body: response.data,
    headers: headersObj,
    statusCode: response.status,
    statusMessage: response.statusText,
  };
}
