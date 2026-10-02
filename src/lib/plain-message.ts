/**
 * Display-only translation of known system phrases into plain language for
 * non-technical users. Stored records and data-API errors keep their original
 * wording (the native backend and its contracts depend on it); call this only
 * where a message is rendered to the user.
 */
const PHRASE_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  // Longer phrases come before shorter overlapping ones so they match first.
  [
    "Agent run start blocked by global kill switch",
    "The AI assistant task didn't start because everything is paused",
  ],
  [
    "Agent run cancelled after approval rejection:",
    "AI assistant task cancelled because the approval was rejected:",
  ],
  [
    "All attached candidates were already scored",
    "All ideas in this task already had a match score",
  ],
  [
    "All attached candidates were removed",
    "All ideas in this task were removed",
  ],
  [
    "Scheduler skipped a due job because the global kill switch is enabled.",
    "A post that was due didn't go out because everything is paused.",
  ],
  ["Scheduler tick started.", "Auto-posting check started."],
  ["Scheduler tick completed.", "Auto-posting check finished."],
  ["Metric refresh tick started.", "Analytics update check started."],
  ["Metric refresh tick completed.", "Analytics update check finished."],
  [
    "Autopilot planner tick blocked by the global kill switch.",
    "Autopilot check stopped because everything is paused.",
  ],
  [
    "Autopilot planner tick completed without creating work.",
    "Autopilot check finished with nothing new to do.",
  ],
  ["Autopilot planner tick started.", "Autopilot check started."],
  ["Autopilot planner tick completed.", "Autopilot check finished."],
  [
    "Source batch materialization blocked by the global kill switch.",
    "An import wasn't turned into tasks because everything is paused.",
  ],
  [
    "Provider-backed agent execution requires API-key credentials",
    "This AI service needs an API key. Add one in Connected accounts, then try again.",
  ],
  [
    "Provider is not connected",
    "Your AI service isn't connected. Connect it in Connected accounts, then try again.",
  ],
  [
    "Custom provider requires a Base URL override",
    "Your custom AI service needs a web address. Add it in Connected accounts, then try again.",
  ],
  [
    "Provider execution requires a Base URL override",
    "This AI service needs a web address. Add it in Connected accounts, then try again.",
  ],
  [
    "Bright Data does not accept a Base URL override",
    "Bright Data doesn't use a web address. Leave it blank.",
  ],
  [
    "Base URL points to this computer or a private network. Reconnect the provider and allow the local endpoint to use it",
    "This web address points to this computer or a private network. Connect again and allow the local address to use it",
  ],
  [
    "Base URL must use https:// unless it is an allowed local endpoint",
    "The web address must start with https:// unless it's an allowed local address",
  ],
  [
    "Base URL must not contain spaces or control characters",
    "The web address can't contain spaces or hidden characters",
  ],
  [
    "Base URL must not include a username or password",
    "The web address can't include a username or password",
  ],
  [
    "Base URL must not include a query string or fragment",
    "The web address can't include anything after ? or #",
  ],
  [
    "Base URL must include a host name",
    "The web address is missing the site name",
  ],
  [
    "Base URL must start with https://",
    "The web address must start with https://",
  ],
  ["Base URL is not a valid URL", "The web address doesn't look right"],
  ["Base URL is too long", "The web address is too long"],
  ["Draft AI audit failed", "The AI review didn't finish. Try again."],
  ["Quality loop failed", "The quality check didn't finish. Try again."],
  ["Global kill switch is enabled", "Everything is paused"],
  ["Metric refresh skipped:", "Analytics update skipped:"],
  ["candidate score application was blocked", "the idea scores weren't saved"],
];

/** Rewrites known system phrases inside `text`; unknown text is returned unchanged. */
export function toPlainMessage(text: string): string {
  let result = text;
  for (const [systemPhrase, plainPhrase] of PHRASE_REPLACEMENTS) {
    result = result.split(systemPhrase).join(plainPhrase);
  }
  return result;
}
