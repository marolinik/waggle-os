# Error states rendered as empty states were the dominant novice-trust defect

The single biggest "app feels broken/dumb" pattern was not missing features — it was hooks that
captured `error` but components that never threaded it, so "No approvals yet" stood in for "the
server is down" on trust/activity surfaces. A novice cannot distinguish broken from idle, which
directly kills the "it remembers me" feeling (memory looks like it vanished). Fixed across 8
surfaces in P7/D15 Track B (`Promise.allSettled` + explicit error/connecting/reconnect states in
ApprovalsApp, RoomApp, CommandCenter, Files, Waggle/Events/Timeline). Rule going forward: every
data surface needs loading / error / empty / populated as four distinct renders — empty must never
be the fallback for failure.
