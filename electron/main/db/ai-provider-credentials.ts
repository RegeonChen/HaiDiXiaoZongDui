/**
 * AI Provider 凭证编码层。
 *
 * Repository 不直接依赖 Electron，主进程在 app ready 后注入 safeStorage。
 * 数据库存储格式带版本前缀，便于区分历史明文和未来的编码升级。
 */

export const AI_CREDENTIAL_PREFIX = 'safe-storage:v1:';

export interface AiCredentialStorage {
  isEncryptionAvailable(): boolean;
  getBackendName(): string;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

let credentialStorage: AiCredentialStorage | null = null;

export function configureAiCredentialStorage(storage: AiCredentialStorage): void {
  credentialStorage = storage;
}

export function isProtectedApiKey(value: string): boolean {
  return value.startsWith(AI_CREDENTIAL_PREFIX);
}

export function canProtectApiKeys(): boolean {
  return credentialStorage?.isEncryptionAvailable() === true;
}

export function getCredentialBackendName(): string {
  return credentialStorage?.getBackendName() ?? 'unconfigured';
}

export function protectApiKey(plainText: string): string {
  if (plainText.length === 0) return '';
  if (!credentialStorage) {
    throw new Error('系统凭证存储尚未初始化');
  }
  if (!credentialStorage.isEncryptionAvailable()) {
    throw new Error(
      `系统安全凭证存储不可用（${credentialStorage.getBackendName()}），无法保存 API Key`
    );
  }
  const encrypted = credentialStorage.encryptString(plainText);
  return `${AI_CREDENTIAL_PREFIX}${encrypted.toString('base64')}`;
}

export function revealApiKey(storedValue: string): string {
  if (!storedValue || !isProtectedApiKey(storedValue)) {
    // 历史明文只用于兼容读取；启动迁移会在安全存储可用时立即改写。
    return storedValue;
  }
  if (!credentialStorage) {
    throw new Error('系统凭证存储尚未初始化');
  }
  if (!credentialStorage.isEncryptionAvailable()) {
    throw new Error(
      `系统安全凭证存储不可用（${credentialStorage.getBackendName()}），无法读取 API Key`
    );
  }
  const payload = storedValue.slice(AI_CREDENTIAL_PREFIX.length);
  try {
    return credentialStorage.decryptString(Buffer.from(payload, 'base64'));
  } catch {
    throw new Error('API Key 无法解密，请在 AI 设置中重新输入');
  }
}
