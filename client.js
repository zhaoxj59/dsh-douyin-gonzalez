// DSH web client half (best-effort, original code).
//
// What is certain: package.json declares dsh.client.platform "web"
// and injects "@deepseek-ai/dsh-client-ui-settings-general", matching
// LockyBee 1.4.7. What is NOT certain from public docs is the exact
// client-runtime API for adding a settings section in DSH 0.2.2-rc.2,
// so this file does NOT pretend to mount a native settings page.
// It only:
//   1. exposes a `douyin-gonzalez` client module (so DSH can load it),
//   2. adds a small link in the settings area (if the runtime exposes
//      the documented settings-general injection point) pointing at
//      the local settings server (see settings/settings-server.mjs),
//      which is the GUARANTEED working friend-selection UI.
// If the client runtime is absent / different, this file is a no-op
// and the host half (dsh-plugin.mjs) still works.
export const name = 'douyin-gonzalez-client';

export function apply(ctx) {
  try {
    const settings = ctx?.get?.('@deepseek-ai/dsh-client-ui-settings-general');
    if (settings && typeof settings.addSection === 'function') {
      settings.addSection({
        id: 'douyin-gonzalez',
        title: '刷抖音（自写）',
        description: '好友互动请打开本地设置页：http://127.0.0.1:8765/ （先运行 npm run settings）。勾选后点“保存”，重启 DSH 后仍在。',
      });
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
      factory: () => ({ name, apply }),
    });
  } catch { /* no-op */ }
}
