import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronState = vi.hoisted(() => ({ userDataPath: '' }));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`Unexpected Electron path: ${name}`);
      return electronState.userDataPath;
    }
  }
}));

import {
  AI_CREDENTIAL_PREFIX,
  configureAiCredentialStorage
} from './ai-provider-credentials';
import { AiProviderRepository } from './ai-provider-repository';
import {
  closeDatabase,
  getDatabase,
  initDatabase
} from './connection';
import { runMigrations } from './migration';

describe('AiProviderRepository credential persistence', () => {
  beforeEach(async () => {
    electronState.userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-provider-test-'));
    configureAiCredentialStorage({
      isEncryptionAvailable: () => true,
      getBackendName: () => 'test-secure',
      encryptString: (plainText) => Buffer.from(`cipher:${plainText}`, 'utf8'),
      decryptString: (encrypted) => encrypted.toString('utf8').replace(/^cipher:/, '')
    });
    await initDatabase();
    runMigrations();
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(electronState.userDataPath, { recursive: true, force: true });
  });

  it('stores new and updated API keys as versioned ciphertext and only reveals them internally', () => {
    const created = AiProviderRepository.create({
      name: 'Secure Provider',
      baseUrl: 'https://api.example.test/v1',
      modelName: 'model-a',
      apiKey: 'sk-create-secret',
      isDefault: true
    });
    const rawAfterCreate = String(
      getDatabase().exec(
        'SELECT api_key FROM ai_providers WHERE id = ?',
        [created.id]
      )[0].values[0][0]
    );

    expect(created.apiKeySet).toBe(true);
    expect(rawAfterCreate.startsWith(AI_CREDENTIAL_PREFIX)).toBe(true);
    expect(rawAfterCreate).not.toContain('sk-create-secret');
    expect(AiProviderRepository.getByIdWithKey(created.id)?._apiKey)
      .toBe('sk-create-secret');

    AiProviderRepository.update(created.id, { apiKey: 'sk-update-secret' });
    const rawAfterUpdate = String(
      getDatabase().exec(
        'SELECT api_key FROM ai_providers WHERE id = ?',
        [created.id]
      )[0].values[0][0]
    );
    expect(rawAfterUpdate.startsWith(AI_CREDENTIAL_PREFIX)).toBe(true);
    expect(rawAfterUpdate).not.toContain('sk-update-secret');
    expect(AiProviderRepository.getByIdWithKey(created.id)?._apiKey)
      .toBe('sk-update-secret');
  });

  it('migrates legacy plaintext once and leaves encrypted rows untouched', () => {
    const timestamp = new Date().toISOString();
    getDatabase().run(
      `INSERT INTO ai_providers
       (id, name, base_url, model_name, api_key, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'legacy-provider',
        'Legacy',
        'https://legacy.example.test/v1',
        'legacy-model',
        'legacy-plain-secret',
        1,
        timestamp,
        timestamp
      ]
    );

    expect(AiProviderRepository.migrateLegacyApiKeys()).toMatchObject({
      migrated: 1,
      skipped: 0,
      backend: 'test-secure'
    });
    const stored = String(
      getDatabase().exec(
        'SELECT api_key FROM ai_providers WHERE id = ?',
        ['legacy-provider']
      )[0].values[0][0]
    );
    expect(stored.startsWith(AI_CREDENTIAL_PREFIX)).toBe(true);
    expect(stored).not.toContain('legacy-plain-secret');
    expect(AiProviderRepository.getDefaultWithKey()?._apiKey)
      .toBe('legacy-plain-secret');
    expect(AiProviderRepository.migrateLegacyApiKeys().migrated).toBe(0);
  });
});
