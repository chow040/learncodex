export type DebateProgressStep =
  | 'trader_analyzing'
  | 'trader_to_risk_manager'
  | 'risk_manager_reviewing'
  | 'risk_manager_feedback'
  | 'trader_reassessing'
  | 'referee_merging'
  | 'completed'
  | 'failed';

export interface DebateProgressEvent {
  step: DebateProgressStep;
  message: string;
  detail?: string;
}

export const DEBATE_PROGRESS_LABELS: Record<DebateProgressStep, string> = {
  trader_analyzing: 'Trader analyzing chart',
  trader_to_risk_manager: 'Trader sent assessment to risk manager',
  risk_manager_reviewing: 'Risk manager reviewing trader assessment',
  risk_manager_feedback: 'Risk manager feedback to trader',
  trader_reassessing: 'Trader reassessing chart',
  referee_merging: 'Referee merging final plan',
  completed: 'Debate completed',
  failed: 'Debate failed',
};
