import { describe, expect, it } from 'vitest';
import { formatUserFacingError } from './user-facing-error';

describe('formatUserFacingError', () => {
  it.each([
    ['[HTTP_TIMEOUT] 请求超时：example.com', 'sync', '连接订阅服务器超时（example.com）。请检查网络或系统代理后重试。'],
    ['[FEED_PARSE_FAILED] RSS/Atom 解析失败', 'sync', '返回内容不是可识别的 RSS、Atom 或 JSON Feed。请确认填写的是订阅地址，而不是普通网页地址。'],
    [{ code: 'OPML_PARSE_FAILED', message: '文件缺少 OPML 根节点' }, 'opml-import', '无法识别该 OPML 文件。文件可能已损坏，或不是标准 OPML；请从原阅读器重新导出后再试。'],
    [{ code: 'AI_SUMMARY_AUTH_FAILED', message: 'HTTP 401' }, 'ai', 'AI 服务拒绝了请求。请检查 API Key、模型名称以及账号是否有该模型的访问权限。']
  ] as const)('formats %# as actionable Chinese', (error, action, expected) => {
    expect(formatUserFacingError(error, action)).toBe(expected);
  });

  it('hides internal codes and unknown English implementation details', () => {
    expect(formatUserFacingError('ARTICLE_MARK_READ_FAILED: sqlite exploded', 'save'))
      .toBe('本地数据暂时无法读写。请重启应用后重试；若仍失败，请保留数据文件并联系开发者。');
    expect(formatUserFacingError('AI_CHAT_FAILED: upstream exploded', 'ai'))
      .toBe('AI 操作失败。请检查网络、模型配置和 API Key 后重试。');
  });

  it('preserves a useful Chinese message and adds next-step guidance', () => {
    expect(formatUserFacingError('FEED_UPDATE_FAILED: 订阅源名称冲突', 'feed'))
      .toBe('订阅源名称冲突。请检查订阅地址后重试。');
  });
});
