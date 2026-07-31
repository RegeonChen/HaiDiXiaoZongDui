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

  it('integrates the macOS traffic lights into the application toolbar only on macOS', async () => {
    const mainSource = await readFile(
      fileURLToPath(new URL('./index.ts', import.meta.url)),
      'utf8'
    );
    const preloadSource = await readFile(
      fileURLToPath(new URL('../preload/index.ts', import.meta.url)),
      'utf8'
    );
    const layoutCss = await readFile(
      fileURLToPath(new URL('../../src/components/Layout/Layout.css', import.meta.url)),
      'utf8'
    );

    expect(mainSource).toMatch(
      /titleBarStyle:\s*process\.platform === 'darwin' \? 'hiddenInset' : 'default'/
    );
    expect(mainSource).toMatch(
      /trafficLightPosition:\s*process\.platform === 'darwin' \? \{ x: 14, y: 16 \} : undefined/
    );
    expect(preloadSource).toMatch(
      /document\.documentElement\?\.setAttribute\('data-platform', rendererPlatform\)/
    );
    expect(preloadSource).toMatch(/DOMContentLoaded', markRendererPlatform/);
    expect(layoutCss).toMatch(/html\[data-platform='darwin'\] \.app-header\s*\{/);
    expect(layoutCss).toMatch(/padding-left:\s*84px/);
    expect(layoutCss).toMatch(/-webkit-app-region:\s*drag/);
    expect(layoutCss).toMatch(/-webkit-app-region:\s*no-drag/);
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
