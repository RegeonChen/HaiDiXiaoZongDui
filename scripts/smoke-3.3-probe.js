// Task 3.3 smoke probe — injected via executeJavaScript
// __AI_BASE_URL__, __AI_KEY__, __FEED_URL__ replaced at injection time

(async function() {
  var R = {
    base: { ok: false, error: null, checks: {} },
    sp:   { ok: false, error: null, checks: {} },   // settingsPersist
    prov: { ok: false, error: null, checks: {}, skipped: false },
    tag:  { ok: false, error: null, checks: {} },
    note: { ok: false, error: null, checks: {} },
    dig:  { ok: false, error: null, checks: {} },   // digest
    ais:  { ok: false, error: null, checks: {}, skipped: false },
    ait:  { ok: false, error: null, checks: {}, skipped: false },
    aig:  { ok: false, error: null, checks: {}, skipped: false },
    aic:  { ok: false, error: null, checks: {}, skipped: false }
  };

  var api = window.api;
  var AI_URL = __AI_BASE_URL__;
  var AI_KEY = __AI_KEY__;
  var FEED = __FEED_URL__;
  var HAS_AI = AI_URL && AI_KEY;

  function OK(o) { return Object.values(o).every(function(v) { return v === true; }); }

  // ---- base ----
  try {
    var s = await api.settings.get();
    R.base.checks.settingsGet = s.success && s.data.language === 'zh';
    R.base.checks.fontThemeField = s.success && typeof s.data.fontTheme === 'string';
    R.base.checks.visualThemeField = s.success && (s.data.visualTheme === 'classic' || s.data.visualTheme === 'paper');
    R.base.checks.sidebarPercent = s.success && typeof s.data.sidebarPercent === 'number' && s.data.sidebarPercent >= 10 && s.data.sidebarPercent <= 40;
    R.base.checks.listPercent = s.success && typeof s.data.listPercent === 'number' && s.data.listPercent >= 15 && s.data.listPercent <= 50;
    R.base.ok = OK(R.base.checks);
  } catch (e) { R.base.error = String(e); }

  // ---- settingsPersist ----
  try {
    var u = await api.settings.update({ sidebarPercent: 25, visualTheme: 'paper', fontTheme: 'serif' });
    R.sp.checks.sidebarUpdated = u.success && u.data.sidebarPercent === 25;
    R.sp.checks.visualThemeUpdated = u.success && u.data.visualTheme === 'paper';
    R.sp.checks.fontThemeUpdated = u.success && u.data.fontTheme === 'serif';
    var r = await api.settings.get();
    R.sp.checks.persistedSidebar = r.success && r.data.sidebarPercent === 25;
    R.sp.checks.persistedVisualTheme = r.success && r.data.visualTheme === 'paper';
    R.sp.checks.persistedFontTheme = r.success && r.data.fontTheme === 'serif';
    await api.settings.update({ sidebarPercent: 18, visualTheme: 'classic', fontTheme: 'default' });
    R.sp.ok = OK(R.sp.checks);
  } catch (e) { R.sp.error = String(e); }

  // ---- provider ----
  if (HAS_AI) {
    try {
      var p = await api.ai.providerCreate({ name: 'Smoke', baseUrl: AI_URL, modelName: 'm1', apiKey: AI_KEY, isDefault: true });
      R.prov.checks.create = p.success && !!p.data.id && p.data.apiKeySet && p.data.isDefault;
      var pid = p.success ? p.data.id : '';
      var pl = await api.ai.providerList();
      R.prov.checks.list = pl.success && Array.isArray(pl.data) && pl.data.length >= 1;
      var pt = await api.ai.providerTest(pid);
      R.prov.checks.test = pt.success && pt.data?.ok === true;
      var pu = await api.ai.providerUpdate(pid, { name: 'Smoke2' });
      R.prov.checks.update = pu.success && pu.data.name === 'Smoke2';

      var cf = await api.feed.create({ url: FEED + '?chat=1', title: 'AI Chat Feed' });
      R.prov.checks.chatFeedCreated = cf.success;
      if (cf.success) {
        var cs = await api.sync.feed(cf.data.id);
        var ca = await api.article.list({ feedId: cf.data.id });
        var chatArticle = ca.success ? ca.data.items[0] : null;
        R.prov.checks.chatArticleReady =
          cs.success && !!chatArticle &&
          (await api.content.getCleanedMarkdown(chatArticle.id)).success;
        if (chatArticle) {
          var chat1 = await api.ai.chat(chatArticle.id, [
            { role: 'user', content: 'article chat smoke question' }
          ]);
          R.prov.checks.chatReply =
            chat1.success &&
            chat1.data.articleId === chatArticle.id &&
            chat1.data.message.indexOf('Article chat smoke reply') >= 0;
          var chat2 = await api.ai.chat(chatArticle.id, [
            { role: 'user', content: 'article chat smoke question' },
            { role: 'assistant', content: chat1.success ? chat1.data.message : 'missing' },
            { role: 'user', content: 'follow-up smoke question' }
          ]);
          R.prov.checks.chatMultiTurn =
            chat2.success &&
            chat2.data.message.indexOf('Article chat smoke reply') >= 0;
        } else {
          R.prov.checks.chatReply = false;
          R.prov.checks.chatMultiTurn = false;
        }
      } else {
        R.prov.checks.chatArticleReady = false;
        R.prov.checks.chatReply = false;
        R.prov.checks.chatMultiTurn = false;
      }

      var pd = await api.ai.providerDelete(pid);
      R.prov.checks.delete = pd.success;
      R.prov.ok = OK(R.prov.checks);
    } catch (e) { R.prov.error = String(e); }
  } else { R.prov.skipped = 'No AI'; }

  // ---- tag ----
  try {
    var t1 = await api.tag.create({ name: 'ai' });
    R.tag.checks.create = t1.success && !!t1.data.id && t1.data.name === 'ai';
    var t2 = await api.tag.create({ name: 'ai' });
    R.tag.checks.createDup = t2.success && t2.data.id === t1.data.id;
    var tl = await api.tag.list();
    R.tag.checks.list = tl.success && Array.isArray(tl.data) && tl.data.length >= 1;
    var tu = await api.tag.update(t1.data.id, { name: 'ml', color: '#f00' });
    R.tag.checks.update = tu.success && tu.data.name === 'ml';
    var td = await api.tag.delete(t1.data.id);
    R.tag.checks.delete = td.success;
    var tr = await api.tag.list();
    R.tag.checks.deleteVerified = tr.success && !tr.data.some(function(x) { return x.id === t1.data.id; });
    R.tag.ok = OK(R.tag.checks);
  } catch (e) { R.tag.error = String(e); }

  // ---- note ----
  try {
    var nf = await api.feed.create({ url: FEED + '?n=1', title: 'NS' });
    if (nf.success) {
      await api.sync.feed(nf.data.id);
      // 直接查刚创建的 feed 下的 articles
      var sa = await api.article.list({ feedId: nf.data.id });
      if (sa.success && sa.data.items.length > 0) {
        var aid = sa.data.items[0].id;
        var n = await api.note.create({ articleId: aid, markdownContent: 'x' });
        R.note.checks.create = n.success && !!n.data?.id;
        if (n.success) {
          var nl = await api.note.listByArticle(aid);
          R.note.checks.list = nl.success && nl.data.length >= 1;
          var nu = await api.note.update(n.data.id, { markdownContent: 'y' });
          R.note.checks.update = nu.success && nu.data.markdownContent === 'y';
          R.note.checks.delete = (await api.note.delete(n.data.id)).success;
        }
      }
    }
    R.note.ok = OK(R.note.checks);
  } catch (e) { R.note.error = String(e); }

  // ---- digest ----
  try {
    var d = await api.digest.create({ name: 'TD', noteIds: [] });
    R.dig.checks.create = d.success && !!d.data.id;
    var did = d.success ? d.data.id : '';
    R.dig.checks.list = (await api.digest.list()).success && (await api.digest.list()).data.length >= 1;
    R.dig.checks.get = (await api.digest.get(did)).success && (await api.digest.get(did)).data.name === 'TD';
    var ex = await api.digest.export(did, 'markdown');
    R.dig.checks.exportMd = ex.success && typeof ex.data === 'string' && ex.data.indexOf('TD') >= 0;
    var eh = await api.digest.export(did, 'html');
    R.dig.checks.exportHtml = eh.success && typeof eh.data === 'string' && eh.data.indexOf('<!DOCTYPE html>') >= 0;
    R.dig.checks.delete = (await api.digest.delete(did)).success;
    R.dig.ok = OK(R.dig.checks);
  } catch (e) { R.dig.error = String(e); }

  // ---- AI gen + cache (requires real API; skipped in smoke) ----
  R.ais.skipped = 'Needs real API key';
  R.ait.skipped = 'Needs real API key';
  R.aig.skipped = 'Needs real API key';
  R.aic.skipped = 'Needs real API key';

  return JSON.stringify(R);
})();
