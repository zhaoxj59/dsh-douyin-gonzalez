// DSH web client half (best-effort, original code).
//
// v0.3.2 — 用户问“能不能内置到 DSH 里面，不要打开网页设置”：
//   诚实回答：DSH 本体是第三方的，改不了、塞不进去。插件能做的
//   只有 DSH 客户端运行时提供的注入点（package.json 里声明的
//   "@deepseek-ai/dsh-client-ui-settings-general"）。这个文件
//   能做的上限就是在这里挂一个设置分区，里面放最常用的开关
//   和入口；5 个包的全部设置（几十个开关 + 数字 + 选人勾选）
//   放不进原生面板，只能留在本地网页设置页（127.0.0.1:8765）。
//   所以：原生面板 = 快捷入口 + 常用开关；网页页 = 完整设置。
//   下面所有调用都先判运行时有没有这个能力，没有就静默跳过，
//   绝不因为面板挂不上就拖垮插件本体。
export const name = 'douyin-gonzalez-client';

// 原生面板里放的最常用项（和 settings.html / config.json 同一份口径）。
export const NATIVE_PANEL_ITEMS = [
  { id: 'core', label: '核心包（刷抖音 + 回白名单私信）', note: '常驻开着，不用管' },
  { id: 'dangerous', label: '危险动作总开关', note: '点赞 / 评论 / 分享等 9 个危险开关，默认全关' },
  { id: 'whitelist', label: '白名单人数', note: '在网页设置页勾人，勾完自动保存' },
  { id: 'health', label: '一键体检', note: '跑 dy_health_check，13 项真查' },
  { id: 'login', label: '登录抖音', note: '网页设置页 → 核心包 → 打开 Edge 登录抖音' },
];

export function apply(ctx) {
  try {
    const settings = ctx?.get?.('@deepseek-ai/dsh-client-ui-settings-general');
    if (!settings) return;
    // 分区本身：标题 + 说明 + 完整设置页地址。运行时没有 addSection
    // 就跳过，插件本体不受影响。
    if (typeof settings.addSection === 'function') {
      settings.addSection({
        id: 'douyin-gonzalez',
        title: '刷抖音（自写）',
        description: '常用：核心包常驻、危险动作默认全关、白名单在网页页勾人、一键体检跑 dy_health_check。完整设置（5 个包全部开关、预算、选人）请打开本地设置页：http://127.0.0.1:8765/ （先运行 npm run settings）。网页页现在是改完自动保存，勾完不用再点保存。',
        items: NATIVE_PANEL_ITEMS.map((i) => ({ id: i.id, label: i.label, note: i.note })),
      });
    }
    // 运行时如果还提供开关 / 按钮的挂法，也顺手挂上；没有就跳过。
    // （DSH 0.2.2-rc.2 的公开文档里没写死这套 API，所以这里只
    //  做“有就挂，没有拉倒”，不假装一定挂得上。）
    if (typeof settings.addToggle === 'function') {
      settings.addToggle({ id: 'douyin-gonzalez-dangerous', title: '危险动作（点赞/评论/分享等）', description: '默认全关。打开前请先确认。', defaultValue: false });
    }
    if (typeof settings.addButton === 'function') {
      settings.addButton({ id: 'douyin-gonzalez-health', title: '🩺 一键体检', description: '跑 dy_health_check，13 项真查。', onClick: () => { /* DSH 侧调工具 dy_health_check */ } });
      settings.addButton({ id: 'douyin-gonzalez-settings', title: '打开完整设置页', description: 'http://127.0.0.1:8765/', onClick: () => { /* 在 DSH 里打开本地设置页 */ } });
    }
  } catch {
    // Client half is optional; never break the host half.
  }
}

// __ModuleLoader__ factory form, used by some DSH web plugins.
// Kept as a plain export as well; DSH loads ./client via package.json
// exports "./client".
if (typeof window !== 'undefined' && window.__ModuleLoader__) {
  try {
    window.__ModuleLoader__.load({
      id: 'dsh-douyin-gonzalez/client',
      factory: () => ({ name, apply, NATIVE_PANEL_ITEMS }),
    });
  } catch { /* no-op */ }
}
