/** The four first-run steps, in the order a new user should do them. */
export const SETUP_STEP_KEYS = ["linkedin", "ai", "voice", "campaign"] as const;

export type SetupStepKey = (typeof SETUP_STEP_KEYS)[number];

/**
 * `unknown` means the data that decides the step could not be read (for
 * example in a browser preview); the step stays actionable.
 */
export type SetupStepState = "done" | "todo" | "unknown";

/**
 * Extra context for a step that is not done. `writer-guide-off`: the user's
 * style is saved but the Writer guide is off, so drafts ignore it.
 */
export type SetupStepNote = "writer-guide-off";

export interface SetupStepView {
  key: SetupStepKey;
  state: SetupStepState;
  note: SetupStepNote | null;
}

export interface SetupChecklist {
  steps: readonly SetupStepView[];
  doneCount: number;
  total: number;
  /** True only when every step is known to be done. */
  complete: boolean;
}

/** The only setup value Linkgo stores; completion is always derived. */
export interface SetupPreferences {
  dismissed: boolean;
}

/** Minimal storage surface so tests and previews can inject their own. */
export interface SetupPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A source the checklist reads; `null` means it failed to load. */
export interface SetupChecklistSources {
  accounts: readonly SetupAccountFact[] | null;
  writer: SetupWriterFact | null;
  campaignStatuses: readonly string[] | null;
}

/** The Writer guide as drafts see it. */
export interface SetupWriterFact {
  instructions: string;
  /** False when the guide is switched off; drafts then ignore the instructions. */
  enabled: boolean;
}

export interface SetupAccountFact {
  providerKey: string;
  /** Connected LinkedIn account, or an AI account the assistant can use. */
  usable: boolean;
}
