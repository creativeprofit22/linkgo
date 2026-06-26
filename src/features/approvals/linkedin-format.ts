const RESERVED_LITTLE_TEXT_CHARACTERS = new Set([
  "|",
  "{",
  "}",
  "@",
  "[",
  "]",
  "(",
  ")",
  "<",
  ">",
  "#",
  "\\",
  "*",
  "_",
  "~",
]);

export function composeLinkedInCommentary(input: {
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
}): string {
  return [input.hook, input.body, input.cta, input.hashtags]
    .map((block) => block.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function escapeLinkedInLittleText(text: string): string {
  return Array.from(text)
    .map((character) =>
      RESERVED_LITTLE_TEXT_CHARACTERS.has(character)
        ? `\\${character}`
        : character,
    )
    .join("");
}
