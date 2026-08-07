import type { DraftContentIntent } from "@/features/drafts/types";

export interface DraftPromptRoute {
  label: string;
  guidance: string;
  instructions: readonly string[];
}

export const DRAFT_PROMPT_ROUTES: Record<DraftContentIntent, DraftPromptRoute> =
  {
    event: {
      label: "Event",
      guidance: "Turn a timely moment into a useful, durable takeaway.",
      instructions: [
        "Open with a concrete event observation, then pivot from what changed this year to what the reader should do now.",
        "Use a curiosity gap that is resolved with specific evidence from the supplied reference data.",
        "Do not invent attendance, speakers, dates, quotes, or first-person experience.",
      ],
    },
    launch: {
      label: "Launch",
      guidance: "Prove the release through a practical before-and-after.",
      instructions: [
        "Lead with the problem the launch changes, not an announcement cliché.",
        "Use a paid-versus-free or before-versus-after contrast only when supported by the supplied reference data.",
        "Make the post self-proving with a concrete mechanism, constraint, or result; never invent metrics or testimonials.",
      ],
    },
    idea: {
      label: "Idea",
      guidance: "Make one useful point with a clear, credible tension.",
      instructions: [
        "Use a defensible contrarian hook or curiosity gap, then resolve it with one practical operator lesson.",
        "Prefer a specific mechanism over broad thought-leadership claims.",
        "Do not invent personal experience, results, or supporting facts.",
      ],
    },
    community: {
      label: "Community",
      guidance: "Invite useful participation without empty engagement bait.",
      instructions: [
        "Start with a shared community tension or a question that the post itself partially answers.",
        "Use a self-proving example from the supplied reference data before inviting other perspectives.",
        "Avoid manufactured consensus, fake quotes, and generic comment-bait calls to action.",
      ],
    },
  };

export function buildDraftPromptSummary(input: {
  intent: DraftContentIntent;
  variantCount: number;
  angle: string;
  voiceNotes: string;
}): string {
  const route = DRAFT_PROMPT_ROUTES[input.intent];
  const operatorAngle = input.angle.trim() || "No additional angle supplied.";
  const operatorVoice = input.voiceNotes.trim() || "Use the campaign voice.";

  return [
    `Create exactly ${input.variantCount} LinkedIn draft variants using the fixed ${route.label.toLowerCase()} content-intent route.`,
    ...route.instructions,
    `Operator angle: ${operatorAngle}`,
    `Operator voice notes: ${operatorVoice}`,
    "Return the result only through draft_post with the durable draft generation request ID, campaign ID, candidate ID, variant count, content intent, and exactly that many fully authored hook/body/cta/hashtags variants.",
  ].join("\n");
}
