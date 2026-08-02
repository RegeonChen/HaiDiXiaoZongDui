export type OnboardingLanguage = 'zh' | 'en';

export type OnboardingStepId =
  | 'feeds'
  | 'add'
  | 'articles'
  | 'sync'
  | 'reader'
  | 'layout'
  | 'ai'
  | 'search';

export interface OnboardingStep {
  id: OnboardingStepId;
  target: string;
  padding: number;
}

export interface OnboardingCopy {
  eyebrow: string;
  progress: (current: number, total: number) => string;
  previous: string;
  next: string;
  finish: string;
  skip: string;
  locating: string;
  saveError: string;
  reopenHint: string;
  steps: Record<OnboardingStepId, {
    title: string;
    description: string;
    hint: string;
  }>;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: 'feeds', target: '.pane-feeds', padding: 4 },
  { id: 'add', target: '[data-testid="feed-list__create"]', padding: 8 },
  { id: 'articles', target: '.pane-list', padding: 4 },
  { id: 'sync', target: '[data-testid="article-list__action-bar"]', padding: 8 },
  { id: 'reader', target: '.app-editor', padding: 4 },
  { id: 'layout', target: '[data-page-key="reader"]', padding: 7 },
  { id: 'ai', target: '[data-testid="app-header__ai"]', padding: 7 },
  { id: 'search', target: '.app-header__search', padding: 6 }
];

export const ONBOARDING_COPY: Record<OnboardingLanguage, OnboardingCopy> = {
  zh: {
    eyebrow: '聚合拾遗 · 入门',
    progress: (current, total) => `第 ${current} / ${total} 步`,
    previous: '上一步',
    next: '下一步',
    finish: '开始使用',
    skip: '跳过教程',
    locating: '正在定位界面…',
    saveError: '暂时无法保存引导状态，请重试。',
    reopenHint: '以后可在“设置 → 新手教程”重新打开。',
    steps: {
      feeds: {
        title: '从订阅源开始',
        description: '一级目录集中管理 RSS、Atom 和分组。切换来源后，右侧文章目录会立即跟随。',
        hint: '订阅源与标签可以在这里分类整理。'
      },
      add: {
        title: '添加或导入来源',
        description: '点击“＋”可添加单个订阅源，也可以导入或导出 OPML，并创建订阅源分组。',
        hint: '第一次使用时，可以先导入已有的 OPML。'
      },
      articles: {
        title: '浏览文章目录',
        description: '二级目录显示当前范围内的文章、未读状态、来源和发布时间，滚动到底会继续加载。',
        hint: '单击文章临时预览，双击可将标签固定。'
      },
      sync: {
        title: '保持内容最新',
        description: '这里可以同步全部订阅源或当前来源，并把当前范围内的文章批量标为已读。',
        hint: '同步失败的来源会在目录中显示红点。'
      },
      reader: {
        title: '专注阅读',
        description: '灵活窗口承载正文和功能页面。文章支持清洗阅读、原始网页和左右分栏三种模式。',
        hint: '阅读进度之外，摘要、翻译、标签和笔记也都在这里完成。'
      },
      layout: {
        title: '切换工作区密度',
        description: '在阅读页反复点击这个入口，可按“完整目录 → 仅文章目录 → 只保留灵活窗口”循环。',
        hint: '需要沉浸阅读时，可以快速收起两级目录。'
      },
      ai: {
        title: '调用文章 AI 助手',
        description: '打开文章后，可从这里展开上下文 AI 助手；Provider 和模型在设置中由你自行配置。',
        hint: '只有主动使用 AI 功能时，文章内容才会发送给你的模型服务。'
      },
      search: {
        title: '快速找到内容',
        description: '搜索会匹配文章标题、原文和清洗后的正文，即使文章不在当前已加载页也能直接打开。',
        hint: '也可以使用 Ctrl/⌘ + F 快速聚焦搜索框。'
      }
    }
  },
  en: {
    eyebrow: 'JUHE SHIYI · GET STARTED',
    progress: (current, total) => `Step ${current} of ${total}`,
    previous: 'Back',
    next: 'Next',
    finish: 'Start reading',
    skip: 'Skip tutorial',
    locating: 'Locating the interface…',
    saveError: 'Could not save the tutorial state. Please try again.',
    reopenHint: 'You can reopen this from Settings → Getting Started.',
    steps: {
      feeds: {
        title: 'Start with your sources',
        description: 'The primary directory keeps RSS, Atom feeds, and groups together. Selecting a source updates the article directory.',
        hint: 'Organize both feeds and tags from this directory.'
      },
      add: {
        title: 'Add or import sources',
        description: 'Use “+” to add a feed, import or export OPML, and create feed groups.',
        hint: 'If you already use an RSS reader, importing OPML is the quickest start.'
      },
      articles: {
        title: 'Browse the article directory',
        description: 'The secondary directory shows status, source, and publish time, and loads more as you scroll.',
        hint: 'Single-click to preview an article; double-click to pin its tab.'
      },
      sync: {
        title: 'Keep everything current',
        description: 'Sync all feeds or the current source here, and mark the current scope as read when you are done.',
        hint: 'A red dot identifies sources whose latest sync failed.'
      },
      reader: {
        title: 'Focus on reading',
        description: 'The flexible editor hosts articles and tools, with cleaned, original web, and split reading modes.',
        hint: 'Summaries, translation, tags, and notes stay close to the article.'
      },
      layout: {
        title: 'Adjust the workspace density',
        description: 'Repeatedly select Reading to cycle through both directories, article-only, and editor-only layouts.',
        hint: 'Collapse both directories whenever you want a distraction-free view.'
      },
      ai: {
        title: 'Use the article AI assistant',
        description: 'Open an article and expand its contextual assistant here. You choose the provider and model in Settings.',
        hint: 'Content is sent to your model service only when you invoke an AI feature.'
      },
      search: {
        title: 'Find anything quickly',
        description: 'Search covers titles, source text, and cleaned content, including articles beyond the currently loaded page.',
        hint: 'Press Ctrl/⌘ + F to focus search from anywhere.'
      }
    }
  }
};
