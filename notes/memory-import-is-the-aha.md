# The memory-import step is the first-session "it knows me" moment — protect it

Onboarding was reworked (P2/2D) from a 7-step form with orphaned steps into a 5-step chain whose
emotional peak is memory-import → memory-review: the user brings a ChatGPT/Claude/Gemini export and
immediately sees the app articulate who they are. Everything before it must be minimal (who-are-you
is short, tool-discovery auto-detects), and the step is skippable without guilt (vault may already
have keys; exports may not exist). Caveat discovered in J-loop verification: returning-user
auto-complete can skip onboarding entirely on a clean prod install — greeting quality on Home then
carries the whole "it knows me" burden, so the Home cockpit greeting must work even with a thin
identity layer.
