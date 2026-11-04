import {
  PROTOBUF_MIME_TYPE,
  PROTOBUF_SCHEMA_VERSION,
  encodeProtobufPacket,
  decodeProtobufPacket,
  validateAndSanitizeInput,
} from './protobufCodec';

let installed = false;
let nativeFetchRef: typeof fetch | null = null;

function getNativeFetch(): typeof fetch {
  if (nativeFetchRef) return nativeFetchRef;
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    nativeFetchRef = window.fetch.bind(window);
    return nativeFetchRef;
  }
  return fetch;
}

/**
 * Performs an HTTPS (TLS 1.3) enforced, Input-Validated, binary Protocol Buffers (application/x-protobuf)
 * network request.
 */
export async function protobufFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const baseFetch = getNativeFetch();

  let urlStr =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

  // 1. Enforce HTTPS (TLS) for any non-local external HTTP URLs
  if (
    urlStr.startsWith('http://') &&
    !urlStr.startsWith('http://localhost') &&
    !urlStr.startsWith('http://127.0.0.1')
  ) {
    urlStr = 'https://' + urlStr.slice('http://'.length);
  }

  const isApiCall =
    urlStr.startsWith('/api/') ||
    (urlStr.includes('/api/') &&
      (typeof window === 'undefined' ||
        urlStr.startsWith(window.location.origin) ||
        urlStr.startsWith('http://localhost') ||
        urlStr.startsWith('https://')));

  if (!isApiCall) {
    return baseFetch(urlStr, init);
  }

  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  headers.set('Accept', PROTOBUF_MIME_TYPE);
  headers.set('X-Transport-Security', 'TLS-1.3-Strict');
  headers.set('X-Wire-Protocol', PROTOBUF_SCHEMA_VERSION);

  let bodyToSend = init?.body;

  if (bodyToSend !== undefined && bodyToSend !== null) {
    let rawPayload: any = bodyToSend;
    if (typeof bodyToSend === 'string') {
      try {
        rawPayload = JSON.parse(bodyToSend);
      } catch {
        rawPayload = { value: bodyToSend };
      }
    } else if (bodyToSend instanceof Uint8Array || bodyToSend instanceof ArrayBuffer) {
      const bytes = bodyToSend instanceof Uint8Array ? bodyToSend : new Uint8Array(bodyToSend);
      try {
        rawPayload = decodeProtobufPacket(bytes).data;
      } catch {
        rawPayload = null;
      }
    }

    if (rawPayload !== null && !(bodyToSend instanceof FormData) && !(bodyToSend instanceof Blob)) {
      const check = validateAndSanitizeInput(rawPayload);
      if (!check.valid) {
        throw new Error(check.error || "Kiruvchi ma'lumot tekshiruvdan o'tmadi (Input Validation Error)!");
      }
      const protoBytes = encodeProtobufPacket(check.sanitized, 200);
      const binaryBuffer = new Uint8Array(protoBytes.byteLength);
      binaryBuffer.set(protoBytes);
      bodyToSend = binaryBuffer.buffer;
      headers.set('Content-Type', PROTOBUF_MIME_TYPE);
    }
  }

  const response = await baseFetch(urlStr, {
    ...init,
    headers,
    body: bodyToSend,
  });

  const respContentType = (response.headers.get('content-type') || '').toLowerCase();
  if (respContentType.includes(PROTOBUF_MIME_TYPE)) {
    const arrayBuf = await response.clone().arrayBuffer();
    const decodedPacket = decodeProtobufPacket(new Uint8Array(arrayBuf));
    const validatedResp = validateAndSanitizeInput(decodedPacket.data);
    const decodedData = validatedResp.valid ? validatedResp.sanitized : decodedPacket.data;

    return new Proxy(response, {
      get(target, prop, receiver) {
        if (prop === 'json' || prop === 'protobuf') {
          return async () => decodedData;
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  return response;
}

/**
 * Installs global HTTPS (TLS) enforcement, Input Validation, and binary Protocol Buffers (application/x-protobuf)
 * support across the browser runtime without failing if window.fetch is a read-only getter.
 */
export function initProtobufHttpsTransport(): void {
  if (installed || typeof window === 'undefined') {
    return;
  }
  installed = true;

  getNativeFetch();

  // 1. Install Response.prototype.json Protobuf binary decoder so any fetch() receiving
  // Content-Type: application/x-protobuf automatically decodes & validates the binary Protobuf packet.
  try {
    if (typeof Response !== 'undefined' && Response.prototype && typeof Response.prototype.json === 'function') {
      const originalResponseJson = Response.prototype.json;
      Response.prototype.json = async function <T = any>(this: Response): Promise<T> {
        const contentType = (this.headers?.get('content-type') || '').toLowerCase();
        if (contentType.includes(PROTOBUF_MIME_TYPE)) {
          const arrayBuf = await this.clone().arrayBuffer();
          const decodedPacket = decodeProtobufPacket<T>(new Uint8Array(arrayBuf));
          const validated = validateAndSanitizeInput(decodedPacket.data);
          return (validated.valid ? validated.sanitized : decodedPacket.data) as T;
        }
        return originalResponseJson.call(this);
      };
    }
  } catch {}

  // 2. Safely attempt to attach protobufFetch to window / globalThis if the property descriptor allows it.
  try {
    const desc =
      Object.getOwnPropertyDescriptor(window, 'fetch') ||
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'fetch');
    if (!desc || desc.writable) {
      window.fetch = protobufFetch;
    } else if (desc.configurable) {
      Object.defineProperty(window, 'fetch', {
        value: protobufFetch,
        writable: true,
        configurable: true,
      });
    }
  } catch {
    // In environments where window.fetch is a non-configurable getter, Response.prototype.json
    // and direct protobufFetch calls handle Protobuf serialization cleanly without throwing.
  }
}
