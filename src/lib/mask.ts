// Ported from translator.py's _mask_text/_unmask_text.
// The original used spaCy NER server-side; spaCy has no practical browser
// equivalent, so entity spans here are covered by: (1) user-supplied terms,
// exact as before, and (2) a capitalized-phrase heuristic (proper-noun-ish
// runs of Capitalized Words) that catches most names/places/orgs without a
// model. Numbers, formulas, and math are already left untouched by the LLM
// prompt itself (see prompts.ts), same as the original design.

export interface TokenMap {
  [token: string]: string
}

function findUserTermSpans(text: string, userTerms: string[]): [number, number, string][] {
  if (!userTerms.length || !text) return []
  const occupied = new Array(text.length).fill(false)
  const spans: [number, number, string][] = []
  const sorted = [...new Set(userTerms.filter(Boolean))].sort((a, b) => b.length - a.length)
  for (const term of sorted) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(?<!\\w)${escaped}(?!\\w)`, 'gi')
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const s = match.index
      const e = s + match[0].length
      if (occupied.slice(s, e).some(Boolean)) continue
      spans.push([s, e, text.slice(s, e)])
      for (let i = s; i < e; i++) occupied[i] = true
    }
  }
  return spans.sort((a, b) => a[0] - b[0])
}

function findCapitalizedPhraseSpans(text: string, userSpans: [number, number, string][]): [number, number, string][] {
  if (!text) return []
  const pattern = /\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,3}\b/g
  const spans: [number, number, string][] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const s = match.index
    const e = s + match[0].length
    // skip if it's just the first word of a sentence (heuristic: preceded by '. ' or start)
    const before = text.slice(Math.max(0, s - 2), s)
    const isSentenceStart = s === 0 || /[.!?]\s$/.test(before)
    const singleWord = !match[0].includes(' ')
    if (isSentenceStart && singleWord) continue
    const overlapsUser = userSpans.some(([us, ue]) => !(e <= us || s >= ue))
    if (overlapsUser) continue
    spans.push([s, e, match[0]])
  }
  return spans
}

export function maskText(text: string, userTerms: string[]): { masked: string; tokenMap: TokenMap } {
  if (!text) return { masked: text, tokenMap: {} }
  const userSpans = findUserTermSpans(text, userTerms)
  const neSpans = findCapitalizedPhraseSpans(text, userSpans)
  const combined = [
    ...userSpans.map(([s, e, v]) => ({ s, e, v, kind: 'UT' as const })),
    ...neSpans.map(([s, e, v]) => ({ s, e, v, kind: 'NE' as const })),
  ].sort((a, b) => a.s - b.s)

  if (!combined.length) return { masked: text, tokenMap: {} }

  const parts: string[] = []
  const tokenMap: TokenMap = {}
  let cursor = 0
  let utIdx = 0
  let neIdx = 0
  for (const { s, e, v, kind } of combined) {
    if (s < cursor) continue
    parts.push(text.slice(cursor, s))
    const token = kind === 'UT' ? `<<UT${utIdx++}>>` : `<<NE${neIdx++}>>`
    parts.push(token)
    tokenMap[token] = v
    cursor = e
  }
  parts.push(text.slice(cursor))
  return { masked: parts.join(''), tokenMap }
}

export function unmaskText(text: string, tokenMap: TokenMap): string {
  if (!text || !Object.keys(tokenMap).length) return text
  let result = text
  const tokens = Object.keys(tokenMap).sort((a, b) => b.length - a.length)
  for (const token of tokens) {
    result = result.split(token).join(tokenMap[token])
  }
  return result
}

export function isTranslatable(text: string): boolean {
  return Boolean(text && text.trim() && /[a-zA-Z]/.test(text))
}
