/**
 * Phase 4.3.1：新手引导 8 步骤定义 + 多语言
 *
 * 每步包含：
 *   - id: 步骤唯一标识
 *   - selector: 目标 DOM 元素 CSS 选择器
 *     · 优先用稳定 data-testid
 *     · 找不到时回退到结构化 class
 *     · 选择器可能与 null（兼容动态元素：例如同步按钮在未选中 feed 时不存在）
 *   - page: 步骤所期望的页面
 *     · 'reader' / 'settings' / 'tags' / 'notes' / 'digests' / 'topics' / 'opml-export'
 *     · 与 AppPage 取值一致；undefined 表示不强制页面切换
 *   - title / description: 多语言文本（中/英）
 *
 * 设计权衡：
 *   - 不引入 i18n 库；语言切换由 useAppearance.language 决定，组件按 key 取值
 *   - 步骤出现顺序固定（不能跳步）；但每步目标元素缺失时自动 skip（next/prev 计数跳过）
 *   - 选择器覆盖：在 mock 模式下也必须命中（MOCK_ARTICLES / MOCK_FEEDS 已准备就绪）
 */

import type { AppPage } from '../Layout/Layout';
import type { Language } from '../../hooks/useAppearance';

export interface OnboardingStep {
  /** 步骤唯一标识，用于稳定查询 + smoke 探针断言 */
  id: string;
  /** 步骤所期望的页面（undefined = 不强制） */
  page?: AppPage;
  /** 目标元素 CSS 选择器（用于定位 + 镂空 + 缺失跳过） */
  selector: string;
  /** 目标元素尺寸过小时（高亮显示 0×0 或 < 8×8）是否跳过（默认 false） */
  skipIfHidden?: boolean;
  /** 多语言文案 */
  i18n: Record<Language, { title: string; description: string }>;
}

/**
 * 8 步骤引导：
 *   1 侧栏订阅源 → 2 添加订阅按钮 → 3 文章列表 → 4 同步按钮 →
 *   5 阅读区 → 6 隐藏左栏（阅读功能键循环）→ 7 AI 助手 → 8 搜索框
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'sidebar-feeds',
    selector: '.pane-feeds .feed-list',
    skipIfHidden: true,
    i18n: {
      zh: {
        title: '订阅源列表',
        description: '左侧是订阅源列表，支持分组、添加、删除与批量管理。所有同步状态、未读计数都会在这里实时刷新。'
      },
      en: {
        title: 'Feed Sources',
        description: 'The left pane lists your feed sources, with groups, add/remove and batch management. Sync state and unread counts update here in real time.'
      }
    }
  },
  {
    id: 'add-feed',
    selector: '[data-testid="feed-list__create"]',
    skipIfHidden: true,
    i18n: {
      zh: {
        title: '添加订阅',
        description: '点击右上角"+"按钮可添加 RSS/Atom/JSON Feed 订阅，也可以导入 OPML 文件一次性批量导入。'
      },
      en: {
        title: 'Add a Feed',
        description: 'Click the "+" button at the top-right to add an RSS/Atom/JSON feed, or import an OPML file to bring in many at once.'
      }
    }
  },
  {
    id: 'article-list',
    selector: '.pane-list .article-list',
    skipIfHidden: true,
    i18n: {
      zh: {
        title: '文章列表',
        description: '中栏显示当前选中范围的文章列表（所有订阅源 / 未读 / 星标 / 单个订阅源 / 标签）。点击任意文章进入阅读。'
      },
      en: {
        title: 'Article List',
        description: 'The middle pane shows articles in the current scope (All / Unread / Starred / a feed / a tag). Click an article to open it.'
      }
    }
  },
  {
    id: 'sync-button',
    selector: '[data-testid="feed-action__sync"]',
    skipIfHidden: true,
    i18n: {
      zh: {
        title: '同步按钮',
        description: '在"所有订阅源"或某个具体订阅源下，列表顶部会出现"同步"按钮：单源同步只更新当前源，全局同步则依次更新所有源。'
      },
      en: {
        title: 'Sync',
        description: 'Under "All Sources" or a specific feed, a "Sync" button appears at the top. Use it to sync just that feed or all feeds in turn.'
      }
    }
  },
  {
    id: 'reader',
    selector: '.pane-reader .article-reader',
    skipIfHidden: false,
    i18n: {
      zh: {
        title: '阅读区',
        description: '右侧是阅读区，支持三种阅读模式：精简阅读（默认 Markdown 渲染）/ 网页（保留原站样式）/ 分栏（左右对比）。可在工具栏切换。'
      },
      en: {
        title: 'Reader',
        description: 'The right pane is the reader. It supports three modes: Reader (default Markdown render), Web (original page) and Split (side-by-side). Switch from the toolbar.'
      }
    }
  },
  {
    id: 'hide-sidebar',
    selector: '[data-page-key="reader"]',
    skipIfHidden: false,
    i18n: {
      zh: {
        title: '隐藏/展开左栏',
        description: '在阅读页时，反复点击左侧栏的"阅读"功能键可以按"全开 → 收起一级 → 收起二级 → 全开"循环切换目录。'
      },
      en: {
        title: 'Show / Hide the Sidebar',
        description: 'On the reader page, repeatedly click the "Reader" rail button to cycle through both → secondary → none → both, hiding or restoring the directory panes.'
      }
    }
  },
  {
    id: 'ai-button',
    selector: '[data-testid="app-header__ai"]',
    skipIfHidden: true,
    i18n: {
      zh: {
        title: 'AI 助手',
        description: '顶栏"AI"按钮打开文章上下文 AI 助手：可以提问、要求总结、翻译选中的段落、生成文章摘要与翻译。'
      },
      en: {
        title: 'AI Assistant',
        description: 'The "AI" button in the header opens the in-article AI assistant. You can ask questions, summarise, translate selected passages, and more.'
      }
    }
  },
  {
    id: 'search',
    selector: '.search-bar__input',
    skipIfHidden: true,
    i18n: {
      zh: {
        title: '搜索',
        description: '顶栏搜索框支持模糊搜索文章标题与正文，按回车或点击下拉项直接跳转到对应文章。'
      },
      en: {
        title: 'Search',
        description: 'The header search box does fuzzy search over article titles and bodies. Press Enter or click a result to jump to it.'
      }
    }
  }
];

/** 总步骤数（用于"第 N / 8 步"展示） */
export const ONBOARDING_TOTAL_STEPS = ONBOARDING_STEPS.length;

/** 取某步骤的多语言文案 */
export function getStepText(
  step: OnboardingStep,
  language: Language
): { title: string; description: string } {
  return step.i18n[language] ?? step.i18n.zh;
}

/** 步骤通用 UI 文案（按钮 / 进度） */
export interface OnboardingUiText {
  skip: string;
  prev: string;
  next: string;
  finish: string;
  progress: (current: number, total: number) => string;
  step: string;
  of: string;
  close: string;
}

export function getOnboardingUiText(language: Language): OnboardingUiText {
  if (language === 'en') {
    return {
      skip: 'Skip tour',
      prev: 'Previous',
      next: 'Next',
      finish: 'Start using',
      progress: (current, total) => `Step ${current} of ${total}`,
      step: 'Step',
      of: 'of',
      close: 'Close'
    };
  }
  return {
    skip: '跳过引导',
    prev: '上一步',
    next: '下一步',
    finish: '开始使用',
    progress: (current, total) => `第 ${current} / ${total} 步`,
    step: '第',
    of: '步',
    close: '关闭'
  };
}
