// DSH client half, v0.4.0 — 挂进 DSH 设置面板的正确写法。
//
// v0.3.2 用错了 API：ctx.get('@deepseek-ai/dsh-client-ui-settings-general')
// + 旧写法里调的那几个方法在 DSH 里根本不存在，所以设置里
// 什么都没出现。正确的口子是 settings.section slot（多家已上线插件
// 同款写法：lansi-ai/dsh-plugin-starter、AFAP/dsh-desktop-notify、
// Yu-tao-Li/dsh-computer-use-win、Mgeeeeee/dsh-ui-personalization）。
//
// 关键点：
//  1. client.js 是经典脚本（classic script），不能用顶层 export，
//     必须包在 window.__ModuleLoader__.load 的 factory 里。
//  2. factory 要返回 { apply, inject: ['slots', 'locale'] }，否则
//     ctx.slots 根本不会被注入。
//  3. 用 ctx.slots.inject('settings.section', ...) 注册一个 React
//     组件，DSH 把它当设置页左侧的一项渲染出来。
//  4. 面板里只放常用项 + 状态 + 入口，完整设置仍在网页设置页
//     （127.0.0.1:8765），面板通过 fetch 跟它说话；设置服务
//     已加 CORS，面板跨源 fetch 不会被拦。
//  5. 挂不上也不拖垮插件：slots 不在就静默跳过，本体工具照常。
var module = { exports: {} };

if (typeof window !== 'undefined' && window.__ModuleLoader__) {
  window.__ModuleLoader__.load({
    id: 'dsh-douyin-gonzalez/client',
    factory: function (require) {
      var React = require('react');
      var useState = React.useState;
      var useEffect = React.useEffect;
      var el = React.createElement;

      var BASE = 'http://127.0.0.1:8765';
      var inject = ['slots', 'locale'];

      function Section() {
        var state = useState(null);
        var status = state[0];
        var setStatus = state[1];
        var cfgState = useState(null);
        var cfg = cfgState[0];
        var setCfg = cfgState[1];
        var healthState = useState(null);
        var health = healthState[0];
        var setHealth = healthState[1];
        var msgState = useState('');
        var msg = msgState[0];
        var setMsg = msgState[1];
        var busyState = useState(false);
        var busy = busyState[0];
        var setBusy = busyState[1];
        // v0.4.0: 写接口要带设置服务 token。面板在回环源上时能从
        // /api/token 取到；拿不到时写按钮提示去完整设置页操作。
        var tokenState = useState(null);
        var token = tokenState[0];
        var setToken = tokenState[1];

        function load() {
          fetch(BASE + '/api/status').then(function (r) { return r.json(); }).then(setStatus).catch(function () { setStatus({ error: 'settings-off' }); });
          fetch(BASE + '/api/config').then(function (r) { return r.json(); }).then(setCfg).catch(function () { setCfg(null); });
          fetch(BASE + '/api/token').then(function (r) { return r.json(); }).then(function (j) { setToken(j.token || ''); }).catch(function () { setToken(''); });
        }
        useEffect(load, []);

        function togglePkg(key) {
          if (token === null) { setMsg('正在取设置服务 token…'); return; }
          if (!token) { setMsg('拿不到设置服务 token（面板跨源被拦）：请点“打开完整设置页”在设置页里改开关。'); return; }
          if (!cfg || !cfg.packages) return;
          var next = JSON.parse(JSON.stringify(cfg));
          next.packages[key].enabled = !next.packages[key].enabled;
          setBusy(true);
          fetch(BASE + '/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Douyin-Token': token }, body: JSON.stringify({ config: next }) })
            .then(function (r) { return r.json(); })
            .then(function (res) { setMsg(res.ok ? '已自动保存 ' + new Date().toLocaleTimeString() : ('保存失败：' + (res.message || ''))); setCfg(next); })
            .catch(function (e) { setMsg('保存失败：' + e.message); })
            .finally(function () { setBusy(false); });
        }

        function runHealth() {
          if (token === null) { setMsg('正在取设置服务 token…'); return; }
          if (!token) { setMsg('拿不到设置服务 token（面板跨源被拦）：请点“打开完整设置页”，在设置页里跑体检。'); return; }
          setBusy(true);
          setMsg('体检跑着呢…');
          fetch(BASE + '/api/health', { method: 'POST', headers: { 'X-Douyin-Token': token } })
            .then(function (r) { return r.json(); })
            .then(function (res) { setHealth(res); setMsg(''); })
            .catch(function (e) { setMsg('体检跑不起来：' + e.message + '（先确认设置服务在跑：npm run settings）'); })
            .finally(function () { setBusy(false); });
        }

        function openLogin() {
          if (token === null) { setMsg('正在取设置服务 token…'); return; }
          if (!token) { setMsg('拿不到设置服务 token（面板跨源被拦）：请点“打开完整设置页”，在设置页里点登录。'); return; }
          setBusy(true); setMsg('正在打开 Edge…');
          fetch(BASE + '/api/login/open', { method: 'POST', headers: { 'X-Douyin-Token': token } })
            .then(function (r) { return r.json().then(function (j) { return { code: r.status, body: j }; }); })
            .then(function (pair) {
              if (pair.code === 200) setMsg('Edge 已打开，去扫码登录抖音；登上后回来点“刷新状态”。');
              else setMsg('打开失败：' + (pair.body.message || '') + ' ' + (pair.body.fix || ''));
            })
            .catch(function (e) { setMsg('打开失败：' + e.message); })
            .finally(function () { setBusy(false); });
        }

        var pkgNames = { core: '核心包（刷抖音 + 回白名单私信）', interact: '互动包（点赞/评论/分享/收藏/续火花）', discover: '发现包（热榜/搜索/关注/博主）', publish: '发片包（发视频/草稿/ComfyUI）', safety: '安全包（巡检/风控/登录/记忆）' };
        var pkgRows = cfg && cfg.packages ? Object.keys(pkgNames).map(function (key) {
          var on = cfg.packages[key] && cfg.packages[key].enabled;
          return el('div', { key: key, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eee' } },
            el('span', null, pkgNames[key]),
            el('button', { disabled: busy || key === 'core', onClick: function () { togglePkg(key); }, style: { padding: '4px 0', width: 56, textAlign: 'center', borderRadius: 999, border: '1px solid ' + (on ? '#16a34a' : '#d1d5db'), background: on ? '#16a34a' : '#f3f4f6', color: on ? '#fff' : '#6b7280', cursor: 'pointer', fontWeight: 700 } }, on ? '开' : '关'));
        }) : null;

        return el('div', { style: { padding: 16, maxWidth: 640 } },
          el('h2', { style: { margin: '0 0 8px' } }, '刷抖音（自写）v0.4.0'),
          el('p', { style: { color: '#666', margin: '0 0 12px' } }, '核心包常驻开；互动/发现/发片/安全默认关，开哪个再开哪个。危险动作（点赞/评论/分享）默认全关。'),
          status && status.error === 'settings-off'
            ? el('p', { style: { color: '#b91c1c', background: '#fef2f2', padding: 10, borderRadius: 8 } }, '设置服务没跑：设置服务随插件自动起，先完全退出 DSH 再重开；还不行再进 C:\\dsh-douyin-gonzalez-v040 跑 npm run settings。')
            : null,
          status && !status.error
            ? el('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 12px' } },
              el('span', { style: { padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, background: (status.login && status.login.loggedIn) ? '#dcfce7' : '#fee2e2', color: (status.login && status.login.loggedIn) ? '#15803d' : '#b91c1c' } }, '登录：' + ((status.login && status.login.loggedIn) ? '已登录' : '未登录')),
              el('span', { style: { padding: '4px 12px', borderRadius: 999, fontSize: 13, background: '#eff6ff', color: '#1d4ed8' } }, '今天：回复 ' + (status.replies ? status.replies.total : 0) + ' 条私信'))
            : null,
          el('div', null, pkgRows),
          el('div', { style: { display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' } },
            el('button', { disabled: busy, onClick: openLogin, style: { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' } }, '打开 Edge 登录抖音'),
            el('button', { disabled: busy, onClick: runHealth, style: { padding: '8px 16px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' } }, '一键体检'),
            el('button', { disabled: busy, onClick: load, style: { padding: '8px 16px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' } }, '刷新状态'),
            el('button', { onClick: function () { window.open(BASE + '/', '_blank'); }, style: { padding: '8px 16px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' } }, '打开完整设置页')),
          msg ? el('p', { style: { marginTop: 12, color: '#333' } }, msg) : null,
          health ? el('p', { style: { marginTop: 12, color: health.failed ? '#b91c1c' : '#16a34a' } }, '体检：通过 ' + health.passed + ' / ' + health.total + ' 项' + (health.failed ? ('，不通过 ' + health.failed + ' 项，点“打开完整设置页”看每项原因。') : '，全通过。')) : null,
          el('p', { style: { color: '#999', fontSize: 12, marginTop: 16 } }, '完整设置（5 个包全部开关、预算、选人勾选）仍在完整设置页：' + BASE + '/'),
          el('p', { style: { color: '#999', fontSize: 12, marginTop: 4 } }, 'v0.4.0 · 预发布分支 release/v0.4.0-douyin-enhanced')
        );
      }

      function apply(ctx) {
        try {
          if (!ctx || !ctx.slots || typeof ctx.slots.inject !== 'function') return;
          ctx.slots.inject('settings.section', function () {
            return ctx.slots.register({
              name: 'settings.section',
              id: 'douyin-gonzalez',
              order: 30,
              label: function () { return '刷抖音（自写）'; },
              locale: 'douyin-gonzalez',
            }, Section);
          });
        } catch (e) { /* 面板挂不上也不拖垮插件本体 */ }
      }

      module.exports.apply = apply;
      module.exports.inject = inject;
      return module.exports;
    },
  });
}
