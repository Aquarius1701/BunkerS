import protobuf from 'protobufjs';

// ============================================================================
// 1. NATIVE PROTOCOL BUFFERS SCHEMA (NO JSON SERIALIZATION)
// ============================================================================
// Recursive ProtoValue + BunkerStroyPacket schema for 100% binary Protobuf wire transport
const root = new protobuf.Root();

const ProtoValue = new protobuf.Type('ProtoValue')
  .add(new protobuf.Field('kind', 1, 'uint32')) // 0=null, 1=bool, 2=number, 3=string, 4=struct, 5=list
  .add(new protobuf.Field('boolValue', 2, 'bool'))
  .add(new protobuf.Field('numberValue', 3, 'double'))
  .add(new protobuf.Field('stringValue', 4, 'string'))
  .add(new protobuf.MapField('structFields', 5, 'string', 'ProtoValue'))
  .add(new protobuf.Field('listValues', 6, 'ProtoValue', 'repeated'));

const BunkerStroyPacket = new protobuf.Type('BunkerStroyPacket')
  .add(new protobuf.Field('version', 1, 'string'))
  .add(new protobuf.Field('timestampMs', 2, 'double'))
  .add(new protobuf.Field('statusCode', 3, 'int32'))
  .add(new protobuf.Field('root', 4, 'ProtoValue'));

root.add(ProtoValue);
root.add(BunkerStroyPacket);

export const PROTOBUF_MIME_TYPE = 'application/x-protobuf';
export const PROTOBUF_SCHEMA_VERSION = 'bunkerstroy.proto.v3';

// Convert any JS value to ProtoValue tree (pure recursive structure for Protobuf encoding)
function jsToProtoValue(val: any, depth = 0): any {
  if (depth > 14 || val === null || val === undefined) {
    return { kind: 0 };
  }
  if (typeof val === 'boolean') {
    return { kind: 1, boolValue: val };
  }
  if (typeof val === 'number') {
    return { kind: 2, numberValue: Number.isFinite(val) ? val : 0 };
  }
  if (typeof val === 'string') {
    return { kind: 3, stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      kind: 5,
      listValues: val.map((item) => jsToProtoValue(item, depth + 1)),
    };
  }
  if (typeof val === 'object') {
    const structFields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined && typeof v !== 'function' && typeof v !== 'symbol') {
        structFields[k] = jsToProtoValue(v, depth + 1);
      }
    }
    return { kind: 4, structFields };
  }
  return { kind: 0 };
}

// Convert decoded ProtoValue tree back to native JS value
function protoValueToJs(pv: any, depth = 0): any {
  if (!pv || depth > 14) return null;
  const kind = Number(pv.kind || 0);
  switch (kind) {
    case 0:
      return null;
    case 1:
      return Boolean(pv.boolValue);
    case 2:
      return Number(pv.numberValue || 0);
    case 3:
      return String(pv.stringValue ?? '');
    case 4: {
      const out: Record<string, any> = {};
      const fields = pv.structFields || {};
      for (const [k, v] of Object.entries(fields)) {
        out[k] = protoValueToJs(v, depth + 1);
      }
      return out;
    }
    case 5: {
      const list = Array.isArray(pv.listValues) ? pv.listValues : [];
      return list.map((item: any) => protoValueToJs(item, depth + 1));
    }
    default:
      return null;
  }
}

/**
 * Encodes a JS payload into a binary Protocol Buffers Uint8Array wire packet.
 */
export function encodeProtobufPacket(payload: any, statusCode = 200): Uint8Array {
  const messageObj = {
    version: PROTOBUF_SCHEMA_VERSION,
    timestampMs: Date.now(),
    statusCode,
    root: jsToProtoValue(payload, 0),
  };
  const created = BunkerStroyPacket.create(messageObj);
  return BunkerStroyPacket.encode(created).finish();
}

/**
 * Decodes a binary Protocol Buffers Uint8Array / Buffer wire packet into a JS payload.
 */
export function decodeProtobufPacket<T = any>(buffer: Uint8Array): {
  version: string;
  timestampMs: number;
  statusCode: number;
  data: T;
} {
  const decoded: any = BunkerStroyPacket.decode(buffer);
  return {
    version: String(decoded.version || PROTOBUF_SCHEMA_VERSION),
    timestampMs: Number(decoded.timestampMs || 0),
    statusCode: Number(decoded.statusCode || 200),
    data: protoValueToJs(decoded.root, 0) as T,
  };
}

/**
 * Encodes a JS value into Base64-encoded binary Protobuf string (for localStorage / storage persistence).
 */
export function encodeProtobufBase64(payload: any): string {
  const bytes = encodeProtobufPacket(payload, 200);
  if (typeof Buffer !== 'undefined') {
    return 'pb3:' + Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'pb3:' + btoa(binary);
}

/**
 * Decodes a Base64-encoded binary Protobuf string back into a JS value.
 */
export function decodeProtobufBase64<T = any>(raw: string): T | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed.startsWith('pb3:')) return null;
  const b64 = trimmed.slice(4);
  let bytes: Uint8Array;
  if (typeof Buffer !== 'undefined') {
    bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  } else {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
  }
  return decodeProtobufPacket<T>(bytes).data;
}

// ============================================================================
// 2. STRICT INPUT VALIDATION & SANITIZATION (KIRUVCHI MA'LUMOTNI TEKSHIRISH)
// ============================================================================
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype', '$where', '$ne', '$gt', '$lt', '$regex']);
const DANGEROUS_SCRIPT_PATTERN = /<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>|javascript\s*:|vbscript\s*:|on(?:error|load|click|mouseover|focus)\s*=/gi;

export interface InputValidationResult<T = any> {
  valid: boolean;
  sanitized: T;
  error?: string;
}

function sanitizeStringValue(val: string, keyName?: string): { ok: boolean; value: string; error?: string } {
  // Remove null bytes and invisible control characters (except \n, \r, \t)
  let cleaned = val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Max length check (allow larger strings only for base64 media/PDF fields)
  const isMediaField =
    keyName &&
    (keyName.toLowerCase().includes('image') ||
      keyName.toLowerCase().includes('photo') ||
      keyName.toLowerCase().includes('logo') ||
      keyName.toLowerCase().includes('pdf') ||
      keyName.toLowerCase().includes('data'));
  const maxLen = isMediaField ? 6 * 1024 * 1024 : 50000;

  if (cleaned.length > maxLen) {
    return {
      ok: false,
      value: '',
      error: `Maydon (${keyName || 'matn'}) hajmi ruxsat etilgan chegaradan oshib ketdi!`,
    };
  }

  // Strip XSS / script injection patterns
  cleaned = cleaned.replace(DANGEROUS_SCRIPT_PATTERN, '');

  // Field-specific format validation
  if (keyName === 'inn' || keyName === 'stir') {
    const digitsOnly = cleaned.replace(/\D/g, '');
    if (cleaned.trim().length > 0 && (digitsOnly.length < 9 || digitsOnly.length > 14)) {
      return {
        ok: false,
        value: cleaned,
        error: "STIR (INN) raqami noto'g'ri formatda kiritildi!",
      };
    }
  }

  if (keyName === 'idCardNumber' && cleaned.trim().length > 0) {
    const normalizedId = cleaned.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z]{2}\d{7}$/.test(normalizedId)) {
      return {
        ok: false,
        value: cleaned,
        error: "ID karta seriya va raqami formati noto'g'ri (masalan: AD 1234567)!",
      };
    }
  }

  return { ok: true, value: cleaned };
}

export function validateAndSanitizeInput<T = any>(
  input: T,
  depth = 0,
  keyName?: string
): InputValidationResult<T> {
  if (depth > 12) {
    return {
      valid: false,
      sanitized: null as any,
      error: "Kiruvchi ma'lumot darajasi (nesting depth) ruxsat etilgan chegaradan oshib ketdi!",
    };
  }

  if (input === null || input === undefined) {
    return { valid: true, sanitized: input };
  }

  if (typeof input === 'boolean') {
    return { valid: true, sanitized: input };
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      return {
        valid: false,
        sanitized: 0 as any,
        error: `Raqamli qiymat (${keyName || 'number'}) noto'g'ri!`,
      };
    }
    return { valid: true, sanitized: input };
  }

  if (typeof input === 'string') {
    const res = sanitizeStringValue(input, keyName);
    if (!res.ok) {
      return { valid: false, sanitized: res.value as any, error: res.error };
    }
    return { valid: true, sanitized: res.value as any };
  }

  if (Array.isArray(input)) {
    if (input.length > 5000) {
      return {
        valid: false,
        sanitized: [] as any,
        error: "Massiv elementlari soni ruxsat etilgan chegaradan oshib ketdi!",
      };
    }
    const sanitizedArr: any[] = [];
    for (let i = 0; i < input.length; i++) {
      const itemRes = validateAndSanitizeInput(input[i], depth + 1, keyName);
      if (!itemRes.valid) return itemRes as any;
      sanitizedArr.push(itemRes.sanitized);
    }
    return { valid: true, sanitized: sanitizedArr as any };
  }

  if (typeof input === 'object') {
    const keys = Object.keys(input as object);
    if (keys.length > 500) {
      return {
        valid: false,
        sanitized: {} as any,
        error: "Obyekt maydonlari soni ruxsat etilgan chegaradan oshib ketdi!",
      };
    }
    const sanitizedObj: Record<string, any> = {};
    for (const k of keys) {
      if (FORBIDDEN_KEYS.has(k) || k.startsWith('$')) {
        return {
          valid: false,
          sanitized: {} as any,
          error: `Taqiqlangan kalit so'z aniqlandi: ${k}`,
        };
      }
      const val = (input as Record<string, any>)[k];
      const fieldRes = validateAndSanitizeInput(val, depth + 1, k);
      if (!fieldRes.valid) return fieldRes as any;
      sanitizedObj[k] = fieldRes.sanitized;
    }
    return { valid: true, sanitized: sanitizedObj as any };
  }

  return { valid: true, sanitized: input };
}
