// Devanagari -> IAST (International Alphabet of Sanskrit Transliteration)
// Mapping table follows the same character correspondences used by the
// indic-transliteration / sanscript.js project's devanagari<->iast scheme.
// Kept dependency-free and client-side since this is a small, static table.

const VOWELS: Record<string, string> = {
  "अ": "a", "आ": "ā", "इ": "i", "ई": "ī", "उ": "u", "ऊ": "ū",
  "ऋ": "ṛ", "ॠ": "ṝ", "ऌ": "ḷ", "ॡ": "ḹ",
  "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
}

const VOWEL_SIGNS: Record<string, string> = {
  "ा": "ā", "ि": "i", "ी": "ī", "ु": "u", "ू": "ū",
  "ृ": "ṛ", "ॄ": "ṝ", "ॢ": "ḷ", "ॣ": "ḹ",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
}

const CONSONANTS: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ṅ",
  "च": "c", "छ": "ch", "ज": "j", "झ": "jh", "ञ": "ñ",
  "ट": "ṭ", "ठ": "ṭh", "ड": "ḍ", "ढ": "ḍh", "ण": "ṇ",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v",
  "श": "ś", "ष": "ṣ", "स": "s", "ह": "h",
  "ळ": "ḷ",
}

const MISC: Record<string, string> = {
  "ं": "ṃ", "ः": "ḥ", "ँ": "̃", "्": "", "ॐ": "oṃ",
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
  "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
}

export function devanagariToIAST(text: string): string {
  if (!text) return text
  let result = ""
  const chars = Array.from(text)

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]

    if (CONSONANTS[ch]) {
      const next = chars[i + 1]
      result += CONSONANTS[ch]
      if (next === "्") {
        // virama: suppress inherent 'a', consumed by the loop naturally
        continue
      } else if (VOWEL_SIGNS[next]) {
        result += VOWEL_SIGNS[next]
        i++
      } else {
        result += "a" // inherent vowel
      }
      continue
    }

    if (VOWELS[ch]) {
      result += VOWELS[ch]
      continue
    }

    if (MISC[ch] !== undefined) {
      result += MISC[ch]
      continue
    }

    // Punctuation, spaces, danda (।, ॥), Latin passthrough (e.g. masked tokens)
    result += ch
  }

  return result
}
