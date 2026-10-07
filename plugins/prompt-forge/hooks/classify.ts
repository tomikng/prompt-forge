// A prompt that already names what to touch and how to tell it's done gains nothing from a
// rewrite, so it skips the model call. Pure pattern matching: free, local, instant.
const ANCHOR = [
  /(?:^|[\s`'"(])[\w.-]+\/[\w./-]+/, // a path: src/users.js, app/models/
  /\b[\w-]+\.(?:[jt]sx?|mjs|cjs|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|cs|php|vue|svelte|css|scss|html|json|ya?ml|toml|md|sql|sh)\b/i, // a file name
  /`[^`\n]+`/, // inline code
  /\b[a-z]+[A-Z]\w*\b|\b[a-z]+_[a-z_]+\b/, // camelCase or snake_case identifier
]
const FINISH = /\b(?:npm (?:run )?test|pnpm test|yarn test|pytest|cargo test|go test|make test|tests? (?:should |must )?pass|run (?:the )?tests?|make sure|should|must|until|so that|verify|check that|expect(?:ed)?|returns?)\b/i
const VAGUE = /^(?:it|that|this|those|these|the same|same)\b|\b(?:like before|as before|the other one)\b/i

/** Already specific: names a concrete target and a finish line, and points at nothing unresolved. */
export function isClearEnough(text: string): boolean {
  const t = text.trim()
  return ANCHOR.some(re => re.test(t)) && FINISH.test(t) && !VAGUE.test(t)
}
