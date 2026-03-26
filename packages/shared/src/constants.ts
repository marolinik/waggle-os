// @waggle/shared — Constants for M3 Team Pilot

export const TEAM_ROLES = ['owner', 'admin', 'member'] as const;
export const TASK_STATUSES = ['open', 'claimed', 'in_progress', 'done', 'cancelled'] as const;
export const TASK_PRIORITIES = ['critical', 'high', 'normal', 'low'] as const;
export const MESSAGE_TYPES = ['broadcast', 'request', 'response'] as const;
export const JOB_TYPES = ['chat', 'task', 'cron', 'waggle'] as const;
export const JOB_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
export const AGENT_GROUP_STRATEGIES = ['parallel', 'sequential', 'coordinator'] as const;
export const RESOURCE_TYPES = ['model_recipe', 'skill', 'tool_config', 'prompt_template'] as const;
export const SUGGESTION_TYPES = ['dashboard', 'cron', 'share', 'skill', 'upgrade'] as const;

export const MAX_SUGGESTIONS_PER_INTERACTION = 1;
export const SCOUT_DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
export const SUBCONSCIOUS_INTERACTION_THRESHOLD = 10; // reflect every N tasks
export const HIVE_MIND_CRON = '0 9 * * 1'; // weekly Monday 9am
