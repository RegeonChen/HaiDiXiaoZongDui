import { describe, expect, it } from 'vitest';
import {
  AI_CREDENTIAL_PREFIX,
  configureAiCredentialStorage,
  isProtectedApiKey,
  protectApiKey,
  revealApiKey,
  type AiCredentialStorage
} from './ai-provider-credentials';

function fakeStorage(available = true): AiCredentialStorage {
  return {
    isEncryptionAvailable: () => available,
    getBackendName: () => available ? 'test-secure' : 'unavailable',
    encryptString: (plainText) => Buffer.from(`encrypted:${plainText}`, 'utf8'),
    decryptString: (encrypted) => encrypted.toString('utf8').replace(/^encrypted:/, '')
  };
}

describe('AI Provider credential encoding', () => {
  it('round-trips API keys without storing the plaintext value', () => {
    configureAiCredentialStorage(fakeStorage());
    const stored = protectApiKey('sk-sensitive-value');

    expect(stored.startsWith(AI_CREDENTIAL_PREFIX)).toBe(true);
    expect(stored).not.toContain('sk-sensitive-value');
    expect(isProtectedApiKey(stored)).toBe(true);
    expect(revealApiKey(stored)).toBe('sk-sensitive-value');
  });

  it('keeps legacy plaintext readable but refuses new plaintext writes when secure storage is unavailable', () => {
    configureAiCredentialStorage(fakeStorage(false));

    expect(revealApiKey('legacy-plain-key')).toBe('legacy-plain-key');
    expect(() => protectApiKey('new-key')).toThrow(/安全凭证存储不可用/);
  });

  it('reports corrupted encrypted values without exposing their contents', () => {
    configureAiCredentialStorage({
      ...fakeStorage(),
      decryptString: () => {
        throw new Error('native decrypt failure');
      }
    });

    expect(() => revealApiKey(`${AI_CREDENTIAL_PREFIX}broken`))
      .toThrow('API Key 无法解密，请在 AI 设置中重新输入');
  });
});
