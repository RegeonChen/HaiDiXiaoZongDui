/**
 * SplitController 单元测试（Phase 3.5.2）
 *
 * 重点覆盖：
 *   1. 正常切分流程
 *   2. 空字符串 → onReady([])
 *   3. 重复 html → no-op（不重切）
 *   4. splitter 抛错 → onFallback
 *   5. splitter 返回未识别 kind → onFallback
 *   6. ★ React 18 StrictMode dev 模式双调 effect 场景：
 *      start(html) → cleanup(reactive unmount) → start(html 相同) → async 完成
 *      预期：第二次 start 因为 html 相同 no-op，但**第一次**的 async 任务应当
 *      正常触发 onReady（不能因为 strictMode 双调被取消）
 *   7. 竞态：start 多次，后一次的 token 让前一次 async 回调被忽略
 */

import { describe, expect, it, vi } from 'vitest';
import { SplitController, type SplitCallback } from './split-controller';
import type { DataSourceState } from '../types/dataSource';
import type { HtmlBlock } from '@shared/types';

function makeCounters() {
  return {
    loading: 0,
    ready: [] as HtmlBlock[][],
    errors: [] as string[],
    fallbacks: [] as string[]
  };
}

/** 用 vi 包装的 callback + 计数器 */
function makeCb(counters: ReturnType<typeof makeCounters>) {
  return {
    onLoading: vi.fn(() => { counters.loading += 1; }),
    onReady: vi.fn((b: HtmlBlock[]) => { counters.ready.push(b); }),
    onError: vi.fn((e: string) => { counters.errors.push(e); }),
    onFallback: vi.fn((h: string) => { counters.fallbacks.push(h); })
  };
}

describe('SplitController', () => {
  it('正常切分：start(html) → onLoading → onReady(blocks)', async () => {
    const controller = new SplitController();
    const counters = makeCounters();
    const cb = makeCb(counters);
    const blocks: HtmlBlock[] = [{ index: 0, html: '<p>hi</p>', tag: 'P' }];
    const splitter = vi.fn(async () => ({ kind: 'ready', data: blocks } as DataSourceState<HtmlBlock[]>));

    controller.start('<p>hi</p>', splitter, cb);
    // onLoading 同步触发
    expect(counters.loading).toBe(1);
    // 等 microtask flush
    await Promise.resolve();
    await Promise.resolve();
    expect(splitter).toHaveBeenCalledWith('<p>hi</p>');
    expect(counters.ready).toEqual([blocks]);
  });

  it('空字符串：start("") → onReady([])，不调 splitter', async () => {
    const controller = new SplitController();
    const counters = makeCounters();
    const cb = makeCb(counters);
    const splitter = vi.fn();
    controller.start('   ', splitter, cb);
    expect(counters.loading).toBe(0);
    expect(counters.ready).toEqual([[]]);
    expect(splitter).not.toHaveBeenCalled();
  });

  it('重复 html 第二次 start no-op', async () => {
    const controller = new SplitController();
    const counters = makeCounters();
    const cb = makeCb(counters);
    const splitter = vi.fn(async () => ({ kind: 'ready', data: [] } as DataSourceState<HtmlBlock[]>));
    controller.start('<p>a</p>', splitter, cb);
    await Promise.resolve();
    await Promise.resolve();
    expect(splitter).toHaveBeenCalledTimes(1);
    controller.start('<p>a</p>', splitter, cb);
    expect(splitter).toHaveBeenCalledTimes(1);
  });

  it('splitter 抛错 → onFallback(html)', async () => {
    const controller = new SplitController();
    const counters = makeCounters();
    const cb = makeCb(counters);
    const splitter = vi.fn(async () => { throw new Error('boom'); });
    controller.start('<p>a</p>', splitter, cb);
    await Promise.resolve();
    await Promise.resolve();
    expect(counters.fallbacks).toEqual(['<p>a</p>']);
  });

  it('splitter 返回未识别 kind → onFallback', async () => {
    const controller = new SplitController();
    const counters = makeCounters();
    const cb = makeCb(counters);
    const splitter = vi.fn(async () => ({ kind: 'weird', data: null } as unknown as DataSourceState<HtmlBlock[]>));
    controller.start('<p>a</p>', splitter, cb);
    await Promise.resolve();
    await Promise.resolve();
    expect(counters.fallbacks).toEqual(['<p>a</p>']);
  });

  it('★ StrictMode 双调场景：start → start(同 html) → async 完成应触发 onReady', async () => {
    // 模拟 React 18 StrictMode dev 模式：
    //   effect mount 1: controller.start(html, ...)
    //   cleanup 1: （局部 cancelled = true，但 controller 用 token 不受影响）
    //   effect mount 2: controller.start(html, ...)  // 第二次启动
    //   async A 完成 → token 仍有效 → 触发 onReady
    const controller = new SplitController();
    const counters = makeCounters();
    const cb = makeCb(counters);
    const blocks: HtmlBlock[] = [{ index: 0, html: '<p>x</p>', tag: 'P' }];

    // 模拟慢响应的 splitter
    let resolveSplitter!: (v: DataSourceState<HtmlBlock[]>) => void;
    const splitter = vi.fn(
      () => new Promise<DataSourceState<HtmlBlock[]>>((r) => { resolveSplitter = r; })
    );

    // 第一次 effect
    controller.start('<p>x</p>', splitter, cb);
    expect(splitter).toHaveBeenCalledTimes(1);
    // 第二次 effect（StrictMode 双调）
    controller.start('<p>x</p>', splitter, cb);
    // html 相同，第二次 no-op，仍只调一次
    expect(splitter).toHaveBeenCalledTimes(1);

    // 异步完成
    await Promise.resolve();
    resolveSplitter({ kind: 'ready', data: blocks });
    await Promise.resolve();
    await Promise.resolve();

    // 关键：onReady 应当被触发（不是被 cancelled 掉）
    expect(counters.ready).toEqual([blocks]);
  });

  it('竞态：start 两次不同 html，第二次的 async 让第一次的回调被忽略', async () => {
    const controller = new SplitController();
    const counters = makeCounters();
    const cb = makeCb(counters);

    let resolveA!: (v: DataSourceState<HtmlBlock[]>) => void;
    let resolveB!: (v: DataSourceState<HtmlBlock[]>) => void;
    const splitter = vi.fn((html: string) => {
      if (html === 'A') return new Promise<DataSourceState<HtmlBlock[]>>((r) => { resolveA = r; });
      return new Promise<DataSourceState<HtmlBlock[]>>((r) => { resolveB = r; });
    });

    controller.start('A', splitter, cb);
    controller.start('B', splitter, cb); // 第二次启动，token++
    expect(splitter).toHaveBeenCalledTimes(2);

    // A 先返回（已过期）
    resolveA({ kind: 'ready', data: [{ index: 0, html: 'A', tag: 'P' }] });
    await Promise.resolve();
    await Promise.resolve();
    expect(counters.ready).toEqual([]); // A 过期，忽略

    // B 返回（最新）
    resolveB({ kind: 'ready', data: [{ index: 0, html: 'B', tag: 'P' }] });
    await Promise.resolve();
    await Promise.resolve();
    expect(counters.ready).toEqual([[{ index: 0, html: 'B', tag: 'P' }]]);
  });

  it('reset() 后再 start，token 重新计数，stale callback 不触发 setState', async () => {
    const controller = new SplitController();
    const counters = makeCounters();
    const cb = makeCb(counters);

    let resolveOld!: (v: DataSourceState<HtmlBlock[]>) => void;
    const splitter = vi.fn((html: string) => {
      if (html === 'old') return new Promise<DataSourceState<HtmlBlock[]>>((r) => { resolveOld = r; });
      return Promise.resolve({ kind: 'ready', data: [{ index: 0, html, tag: 'P' }] } as DataSourceState<HtmlBlock[]>);
    });

    controller.start('old', splitter, cb);
    controller.reset(); // 模拟组件 unmount → 重新 mount
    controller.start('new', splitter, cb);

    // 旧 promise 完成
    resolveOld({ kind: 'ready', data: [{ index: 0, html: 'old', tag: 'P' }] });
    await Promise.resolve();
    await Promise.resolve();
    // 只有 'new' 触发 onReady
    expect(counters.ready).toEqual([[{ index: 0, html: 'new', tag: 'P' }]]);
  });
});
