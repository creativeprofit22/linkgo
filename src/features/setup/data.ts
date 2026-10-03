import {
  GG_AI_PROVIDER_KEYS,
  PROVIDER_LABELS,
  type AuthProviderKey,
} from "@/agent/provider-catalog";
import { listCampaigns } from "@/features/campaigns/data";
import { campaignsRoute } from "@/features/campaigns/schemas";
import { candidateQueueRoute } from "@/features/candidate-queue/schemas";
import { getAuthStatus, isUsableAiAccount } from "@/features/integrations/data";
import { integrationsRoute } from "@/features/integrations/schemas";
import { listPlaybooks } from "@/features/playbooks/data";
import { playbooksRoute } from "@/features/playbooks/schemas";
import type { AgentPlaybookView } from "@/features/playbooks/types";
import { setupPreferencesSchema } from "@/features/setup/schemas";
import {
  SETUP_STEP_KEYS,
  type SetupChecklist,
  type SetupChecklistSources,
  type SetupPreferenceStorage,
  type SetupPreferences,
  type SetupStepKey,
  type SetupStepState,
  type SetupStepView,
  type SetupWriterFact,
} from "@/features/setup/types";
import { formatRouteHash } from "@/lib/navigation/route-contract";

/** localStorage key for the "Hide setup" choice. */
export const SETUP_PREFERENCES_STORAGE_KEY = "linkgo.setup.preferences";

/** The one AI service the checklist recommends (see style-pack §1a). */
export const RECOMMENDED_AI_PROVIDER = "anthropic" satisfies AuthProviderKey;

/** The playbook whose custom instructions describe how the user writes. */
export const VOICE_PLAYBOOK_KEY = "linkedin_writer";

export interface SetupAiService {
  key: AuthProviderKey;
  label: string;
}

const AI_SERVICE_KEYS: readonly AuthProviderKey[] = [
  ...GG_AI_PROVIDER_KEYS,
  "custom",
];

/** Every other AI service, in Connected accounts order, for "More AI services". */
export const OTHER_AI_SERVICES: readonly SetupAiService[] =
  AI_SERVICE_KEYS.filter((key) => key !== RECOMMENDED_AI_PROVIDER).map(
    (key) => ({ key, label: PROVIDER_LABELS[key] }),
  );

/** Link that opens the screen and dialog finishing a step. */
export function setupStepHref(
  key: SetupStepKey,
  aiProvider: AuthProviderKey = RECOMMENDED_AI_PROVIDER,
): string {
  switch (key) {
    case "linkedin":
      return formatRouteHash(integrationsRoute, { connect: "linkedin" });
    case "ai":
      return formatRouteHash(integrationsRoute, { connect: aiProvider });
    case "voice":
      return formatRouteHash(playbooksRoute, { focus: VOICE_PLAYBOOK_KEY });
    case "campaign":
      return formatRouteHash(campaignsRoute, { new: "1" });
  }
}

/** Link for the action shown once setup is complete. */
export function findFirstIdeaHref(): string {
  return formatRouteHash(candidateQueueRoute, { find: "1" });
}

function stateFrom(source: unknown, isDone: () => boolean): SetupStepState {
  if (source === null) return "unknown";
  return isDone() ? "done" : "todo";
}

/** Pure: turns what was read into the ordered checklist. */
export function deriveSetupChecklist(
  sources: SetupChecklistSources,
): SetupChecklist {
  const { accounts, writer, campaignStatuses } = sources;
  const hasWriterInstructions = (writer?.instructions ?? "").trim().length > 0;
  const writerEnabled = writer?.enabled ?? false;
  const states: Record<SetupStepKey, SetupStepState> = {
    linkedin: stateFrom(accounts, () =>
      (accounts ?? []).some(
        (account) => account.providerKey === "linkedin" && account.usable,
      ),
    ),
    ai: stateFrom(accounts, () =>
      (accounts ?? []).some(
        (account) => account.providerKey !== "linkedin" && account.usable,
      ),
    ),
    // Drafts drop the instructions when the guide is off, so both must hold.
    voice: stateFrom(writer, () => hasWriterInstructions && writerEnabled),
    campaign: stateFrom(campaignStatuses, () =>
      (campaignStatuses ?? []).some((status) => status !== "archived"),
    ),
  };
  const writerGuideOff = hasWriterInstructions && !writerEnabled;
  const steps: SetupStepView[] = SETUP_STEP_KEYS.map((key) => ({
    key,
    state: states[key],
    note: key === "voice" && writerGuideOff ? "writer-guide-off" : null,
  }));
  const doneCount = steps.filter((step) => step.state === "done").length;
  return {
    steps,
    doneCount,
    total: steps.length,
    complete: doneCount === steps.length,
  };
}

function writerFact(
  playbookRows: readonly AgentPlaybookView[] | null,
): SetupWriterFact | null {
  if (playbookRows === null) return null;
  const row = playbookRows.find((entry) => entry.key === VOICE_PLAYBOOK_KEY);
  return {
    instructions: row?.customInstructions ?? "",
    enabled: row?.enabled ?? false,
  };
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

/**
 * Reads accounts, the Writer guide and campaigns through their owners'
 * public APIs. A source that fails becomes `unknown`, never an error.
 */
export async function loadSetupChecklist(
  signal?: AbortSignal,
): Promise<SetupChecklist | null> {
  const [auth, playbooks, campaigns] = await Promise.allSettled([
    getAuthStatus(),
    listPlaybooks(),
    listCampaigns(),
  ]);
  if (signal?.aborted) return null;
  const status = settledValue(auth);
  const playbookRows = settledValue(playbooks);
  const campaignRows = settledValue(campaigns);
  return deriveSetupChecklist({
    accounts:
      status?.accounts.map((account) => ({
        providerKey: account.provider_key,
        usable:
          account.provider_key === "linkedin"
            ? account.status === "connected"
            : isUsableAiAccount(account),
      })) ?? null,
    writer: writerFact(playbookRows),
    campaignStatuses: campaignRows?.map((campaign) => campaign.status) ?? null,
  });
}

const DEFAULT_PREFERENCES: SetupPreferences = { dismissed: false };

function defaultStorage(): SetupPreferenceStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Stored preferences, or fresh ones when missing, unreadable or malformed. */
export function readSetupPreferences(
  storage: SetupPreferenceStorage | null = defaultStorage(),
): SetupPreferences {
  if (!storage) return DEFAULT_PREFERENCES;
  try {
    const raw = storage.getItem(SETUP_PREFERENCES_STORAGE_KEY);
    if (raw === null) return DEFAULT_PREFERENCES;
    const parsed = setupPreferencesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Saves preferences; returns false when storage is unavailable. */
export function writeSetupPreferences(
  preferences: SetupPreferences,
  storage: SetupPreferenceStorage | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    const parsed = setupPreferencesSchema.parse(preferences);
    storage.setItem(SETUP_PREFERENCES_STORAGE_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}
