# Ship silent sensible defaults; spend friction only on irreversible actions

Founder-ratified principle from the onboarding/Phase-4 work: do not ask the user to ratify a
default (e.g. "which tools do you want?" during onboarding). Connector tiles and skill chips ship
with silent default ordering; capability appears progressively as the user engages. Friction
(confirmation prompts) is reserved exclusively for irreversible or destructive actions via the
approval runtime. This is the core of progressive reveal: novices never see a configuration
decision they can't evaluate; experts fast-path via Ctrl+K instead of toggles.
