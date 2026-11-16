# Aurabot ↔ DSH Douyin Bridge

This is an **independent Aurabot user module** for the independent DSH Douyin plugin.
It does not move DSH into Aurabot and does not modify Aurabot core.

## Install into Aurabot

Copy this folder to:

`%USERPROFILE%\.dsh\plugins-data\aurabot\modules\douyin-bridge\`

Keep `index.mjs` as the module entry. Restart/reload the Aurabot module if hot reload does not pick it up.

In Aurabot → Modules → douyin-bridge:
1. Enable the module.
2. Set a long random shared token.
3. Keep the token private; configure the same value in DSH.

The module registers:
- `POST /aurabot/api/ext/douyin-bridge/health`
- `POST /aurabot/api/ext/douyin-bridge/message`
- `POST /aurabot/api/ext/douyin-bridge/draft`
- `POST /aurabot/api/ext/douyin-bridge/proactive`

All endpoints require `Authorization: Bearer <shared-token>`.
The module uses `api.think()` for Aurabot persona-aware generation, and stores a separate rolling context per Douyin sender in its own module data directory. It deliberately does not read or write QQ private-chat memory, avoiding cross-contact leakage.

**Important:** this module generates reply text only. DSH remains the only component that sends messages through the Douyin browser. The DSH-side inbox polling/DOM selectors must be verified against the user's live Douyin UI before enabling unattended automatic receiving. No CAPTCHA or platform restriction is bypassed.
