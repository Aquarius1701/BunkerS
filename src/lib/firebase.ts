import { initializeApp } from 'firebase/app';
import { protobufFetch as fetch } from './protobufClient';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, deleteField } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export { deleteField };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test on boot as mandated
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline. Checking network...');
    }
    return false;
  }
}

export async function loginWithGoogle() {
  return await signInWithPopup(auth, googleProvider);
}

export async function logoutUser() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  return await signOut(auth);
}

// Format login into a valid synthetic email for Firebase Auth if not already an email
export function loginToFirebaseEmail(login: string): string {
  const clean = String(login || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_');
  if (clean.includes('@')) return clean;
  return `${clean || 'user'}@auth.bunkerstroy.uz`;
}

// Link or sign in an account with Firebase Authentication (Email/Password)
export async function syncFirebaseAccountWithEmail(
  login: string,
  newStrongPassword: string
): Promise<{ firebaseUid: string | null; email: string }> {
  const email = loginToFirebaseEmail(login);
  const safeFirebasePass =
    newStrongPassword.length >= 6 ? newStrongPassword : `${newStrongPassword}_bs2026`;
  try {
    const created = await createUserWithEmailAndPassword(auth, email, safeFirebasePass);
    return { firebaseUid: created.user.uid, email };
  } catch (err: any) {
    if (err?.code === 'auth/email-already-in-use') {
      try {
        const signedIn = await signInWithEmailAndPassword(auth, email, safeFirebasePass);
        return { firebaseUid: signedIn.user.uid, email };
      } catch {
        if (auth.currentUser) {
          try {
            await updatePassword(auth.currentUser, safeFirebasePass);
          } catch {}
          return { firebaseUid: auth.currentUser.uid, email };
        }
      }
    }
    return { firebaseUid: auth.currentUser?.uid || null, email };
  }
}

// Format phone number into E.164 (+998XXXXXXXXX)
export function formatPhoneE164(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.length === 9) {
    return `+998${digits}`;
  }
  return `+${digits}`;
}

let activeRecaptchaVerifier: RecaptchaVerifier | null = null;

// Send 6-digit OTP via backend SMS endpoint (works without external SMS API key)
export async function sendSecurePhoneOtp(
  phone: string,
  purpose: 'migration' | 'signup' | 'recovery' | 'confirm' = 'confirm',
  _recaptchaContainerId?: string,
  options?: { userId?: string; expectedAccountPhone?: string }
): Promise<{
  success: boolean;
  channel: 'firebase_phone' | 'backend_sms';
  confirmationResult?: ConfirmationResult;
  code?: string;
  message: string;
  error?: string;
}> {
  const e164 = formatPhoneE164(phone);

  try {
    const resp = await fetch('/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: e164,
        purpose,
        userId: options?.userId,
        expectedAccountPhone: options?.expectedAccountPhone,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.error) {
      return {
        success: false,
        channel: 'backend_sms',
        message: '',
        error: data?.error || 'SMS yuborishda xatolik yuz berdi',
      };
    }
    const codeStr = data?.code ? String(data.code) : undefined;
    return {
      success: true,
      channel: 'backend_sms',
      code: codeStr,
      message: codeStr
        ? `📲 SMS tasdiqlash kodi ${phone} raqamiga yuborildi. Kod: ${codeStr}`
        : `📲 SMS tasdiqlash kodi ${phone} raqamiga yuborildi.`,
    };
  } catch (err: any) {
    return {
      success: false,
      channel: 'backend_sms',
      message: '',
      error: err?.message || 'SMS xizmati bilan aloqa o‘rnatilmadi',
    };
  }
}

export async function verifySecurePhoneOtp(params: {
  phone: string;
  code: string;
  purpose?: string;
  expectedAccountPhone?: string;
  confirmationResult?: ConfirmationResult | null;
}): Promise<{
  verified: boolean;
  verificationToken?: string;
  firebaseUid?: string;
  error?: string;
}> {
  const cleanCode = String(params.code || '').replace(/\D/g, '').trim();
  if (cleanCode.length !== 6) {
    return {
      verified: false,
      error: 'Iltimos, 6 xonali SMS tasdiqlash kodini kiriting.',
    };
  }

  if (params.confirmationResult) {
    try {
      const cred = await params.confirmationResult.confirm(cleanCode);
      return {
        verified: true,
        firebaseUid: cred.user?.uid,
      };
    } catch {
      return {
        verified: false,
        error: "SMS tasdiqlash kodi noto'g'ri yoki muddati tugagan.",
      };
    }
  }

  try {
    const resp = await fetch('/api/sms/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: params.phone,
        code: cleanCode,
        purpose: params.purpose || 'confirm',
        expectedAccountPhone: params.expectedAccountPhone,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.verified) {
      return {
        verified: false,
        error: data?.error || "SMS tasdiqlash kodi noto'g'ri!",
      };
    }
    return {
      verified: true,
      verificationToken: data.verificationToken,
    };
  } catch (err: any) {
    return {
      verified: false,
      error: err?.message || 'SMS kodni tekshirishda server xatosi yuz berdi.',
    };
  }
}

export async function createMigrationBackup(params: {
  userId: string;
  login: string;
  role: string;
  accountSnapshot: any;
}): Promise<{ backupId: string | null }> {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('bunkerstroy_migration_backups_v1');
      const list = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(list) ? list : [];
      next.unshift({
        userId: params.userId,
        login: params.login,
        role: params.role,
        snapshot: params.accountSnapshot,
        backedUpAt: new Date().toISOString(),
      });
      localStorage.setItem('bunkerstroy_migration_backups_v1', JSON.stringify(next.slice(0, 50)));
    }
  } catch {}

  try {
    const resp = await fetch('/api/auth/migration-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await resp.json().catch(() => ({}));
    return { backupId: data?.backupId || null };
  } catch {
    return { backupId: null };
  }
}

export async function rollbackMigrationBackup(params: {
  backupId?: string;
  userId?: string;
  login?: string;
}): Promise<{ success: boolean; restoredAccount?: any }> {
  try {
    const resp = await fetch('/api/auth/migration-rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data?.success && data?.restoredAccount) {
      return { success: true, restoredAccount: data.restoredAccount };
    }
  } catch {}
  return { success: false };
}

export async function hashPasswordServerSide(password: string): Promise<string | null> {
  try {
    const resp = await fetch('/api/auth/hash-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await resp.json().catch(() => ({}));
    return data?.passwordHash || null;
  } catch {
    return null;
  }
}

export async function verifyPasswordServerSide(
  password: string,
  passwordHash?: string,
  legacyPlaintextFallback?: string
): Promise<boolean> {
  const cleanCandidate = String(password || '').trim();
  if (!cleanCandidate) return false;
  if (passwordHash && String(passwordHash).startsWith('$argon2id$')) {
    try {
      const resp = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: cleanCandidate, passwordHash }),
      });
      const data = await resp.json().catch(() => ({}));
      return Boolean(data?.valid);
    } catch {
      return false;
    }
  }
  if (legacyPlaintextFallback !== undefined) {
    return cleanCandidate === String(legacyPlaintextFallback).trim();
  }
  return false;
}


