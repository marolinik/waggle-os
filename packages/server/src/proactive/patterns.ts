export interface PatternDef {
  name: string;
  triggerCondition: string;
  suggestionType: string;
  template: string;
}

export const BUILT_IN_PATTERNS: PatternDef[] = [
  {
    name: 'recurring_task',
    triggerCondition: 'Same task type executed 3+ times',
    suggestionType: 'cron',
    template: 'This task runs frequently. Would you like to automate it as a scheduled job?',
  },
  {
    name: 'data_report',
    triggerCondition: 'Job output contains structured data/metrics',
    suggestionType: 'dashboard',
    template: 'This produces data regularly. Want to create a dashboard for it?',
  },
  {
    name: 'relevant_to_others',
    triggerCondition: 'Job output matches other team member interests',
    suggestionType: 'share',
    template: 'This result might be relevant to {targetUser}. Share it?',
  },
  {
    name: 'expensive_model',
    triggerCondition: 'Job used expensive model for simple task',
    suggestionType: 'upgrade',
    template: 'This task could use a cheaper model. Try {cheaperModel} next time?',
  },
  {
    name: 'manual_repetition',
    triggerCondition: 'User performs same manual steps repeatedly',
    suggestionType: 'skill',
    template: 'You keep doing this manually. Want to create a reusable skill for it?',
  },
];
