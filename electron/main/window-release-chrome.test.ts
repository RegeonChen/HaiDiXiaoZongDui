import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('packaged window chrome and icon contract', () => {
  it('removes the default Electron menu above the application toolbar', async () => {
    const source = await readFile(
      fileURLToPath(new URL('./index.ts', import.meta.url)),
      'utf8'
    );

    expect(source).toMatch(/autoHideMenuBar:\s*true/);
    expect(source).toMatch(/win\.removeMenu\(\)/);
  });

  it('keeps packaged and runtime icon resources wired to verified PNG assets', async () => {
    const source = await readFile(
      fileURLToPath(new URL('./index.ts', import.meta.url)),
      'utf8'
    );
    const packageJson = JSON.parse(await readFile(
      fileURLToPath(new URL('../../package.json', import.meta.url)),
      'utf8'
    )) as {
      build: {
        icon: string;
        extraResources: Array<{ from: string; to: string }>;
      };
    };

    expect(source).toMatch(/process\.resourcesPath,\s*'icon\.png'/);
    expect(source).toMatch(/icon:\s*getAppIconPath\(\)/);
    expect(packageJson.build.icon).toBe('build/icon.png');
    expect(packageJson.build.extraResources).toContainEqual({
      from: 'src/public/icon.png',
      to: 'icon.png'
    });
  });
});
