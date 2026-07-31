// Odia post-processing, inspired by AI4Bharat's indic_nlp_library normalizer
// (https://github.com/anoopkunchukuttan/indic_nlp_library), which documents
// two recurring Brahmic-script issues that plain LLM output frequently gets
// subtly wrong for Odia specifically:
//
// 1. Unicode normalization form: LLMs sometimes emit decomposed sequences
//    (base consonant + combining vowel sign as separate codepoints in a
//    non-canonical order) instead of the composed form. NFC normalization
//    fixes most of this, same as indic_nlp_library's `normalize()` step.
//
// 2. Matra reordering: Odia's "ି" (vowel sign I) and a few others are
//    visually pre-base but stored post-base in Unicode. Models occasionally
//    output them in visual order (before the consonant) instead of logical
//    order (after the consonant), which renders as mojibake in Word. This
//    reorders any stray pre-base occurrences back to logical order.

const ODIA_BLOCK = /[\u0B00-\u0B7F]/

// Vowel signs that are logically post-consonant but sometimes emitted
// pre-consonant by mistake.
const REORDER_PATTERN = /([\u0B3F])([\u0B15-\u0B39])/g // ି + consonant -> consonant + ି

export function fixOdiaOrthography(text: string): string {
  if (!text || !ODIA_BLOCK.test(text)) return text

  // Step 1: canonical composition (handles most decomposed-sequence issues).
  let result = text.normalize('NFC')

  // Step 2: fix pre-base vowel sign ordering if the model emitted it in
  // visual rather than logical order.
  result = result.replace(REORDER_PATTERN, '$2$1')

  return result
}

// Odia has its own digit block (୦-୯, U+0B66-U+0B6F). The base mask.ts
// entity/number handling only reasons about ASCII digits, so a segment that
// is mostly Odia numerals wouldn't be flagged specially — this is fine for
// this app since numerals only ever appear in the (English) source text, but
// exported here in case the source pipeline is later extended to accept
// pre-Odia input (e.g. re-translating an existing Odia document).
export function containsOdiaDigits(text: string): boolean {
  return /[\u0B66-\u0B6F]/.test(text)
}
