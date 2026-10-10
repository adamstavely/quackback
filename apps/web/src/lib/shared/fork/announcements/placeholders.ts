/**
 * Template placeholders (`{name}`), filled in when the author picks a template
 * (§4.2). A stored announcement is plain text: the server never interprets
 * braces and no renderer substitutes anything.
 */
const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9_]{0,31})\}/g

/** Placeholder names across the given texts, first occurrence order, no repeats. */
export function listPlaceholders(...texts: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  for (const text of texts) {
    for (const [, name] of (text ?? '').matchAll(PLACEHOLDER)) seen.add(name!)
  }
  return [...seen]
}

/** Replaces each `{name}` that has a value; unknown names are left as written. */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (whole, name: string) =>
    Object.hasOwn(values, name) ? values[name]! : whole
  )
}
