const LINKEDIN_TARGET_URN_PATTERN =
  /urn:li:(ugcPost|share|activity):([A-Za-z0-9_-]+)/u;
const LINKEDIN_POST_ACTIVITY_PATTERN = /activity[-:]([0-9]+)/iu;

function decodeLinkedInValue(value: string): string {
  let decoded = value.trim();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return decoded;
      decoded = next;
    } catch {
      return decoded;
    }
  }
  return decoded;
}

function normalizeLinkedInUrn(value: string): string {
  const decoded = decodeLinkedInValue(value);
  const urnMatch = LINKEDIN_TARGET_URN_PATTERN.exec(decoded);
  if (urnMatch) return `urn:li:${urnMatch[1]}:${urnMatch[2]}`;

  const activityMatch = LINKEDIN_POST_ACTIVITY_PATTERN.exec(decoded);
  if (activityMatch?.[1]) return `urn:li:activity:${activityMatch[1]}`;

  return "";
}

export function resolveLinkedInTargetUrn(candidate: string): string {
  const trimmed = candidate.trim();
  if (!trimmed) return "";

  const direct = normalizeLinkedInUrn(trimmed);
  if (direct) return direct;

  try {
    const url = new URL(trimmed);
    const parts = [url.pathname, url.search, url.hash];
    for (const part of parts) {
      const resolved = normalizeLinkedInUrn(part);
      if (resolved) return resolved;
    }
  } catch {
    return "";
  }

  return "";
}
