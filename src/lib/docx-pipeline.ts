// Browser-side docx handling. This replaces python-docx's paragraph-level
// run/style preservation with a simpler but robust approach: extract text
// paragraph-by-paragraph via mammoth (which also gives us basic style hints:
// heading level, bold), translate each unique paragraph, then rebuild a new
// .docx with the `docx` npm package, re-applying heading levels and bold.
//
// LIMITATION vs. the original: python-docx's run-level splitting (which
// preserves inline bold/italic mixed within a single paragraph, and leaves
// embedded images/drawings untouched by patching only the text runs) has no
// direct browser equivalent. This version preserves paragraph-level
// formatting (heading style, whole-paragraph bold) but does not preserve
// image placement or fine-grained inline run styling. For documents with
// embedded images/diagrams (e.g. figures inside a chapter), review the
// output before finalizing — you may want to re-insert images manually, the
// way DocBookDesigner's pipeline flags image-loss cases for manual review.

import mammoth from 'mammoth'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import { isTranslatable } from './mask'
import { fixOdiaOrthography } from './odia-normalize'

export interface ExtractedParagraph {
  text: string
  headingLevel: number | null // 1-6, or null for normal
  bold: boolean
}

const prefixPattern = /^\s*(?:\d+\.\s*|\(\d+\)\s*|[a-zA-Z]\.\s*|\([a-zA-Z]\)\s*)/

export async function extractParagraphs(file: File): Promise<ExtractedParagraph[]> {
  const arrayBuffer = await file.arrayBuffer()
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer })

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const blocks = Array.from(doc.body.children)

  const paragraphs: ExtractedParagraph[] = []
  for (const el of blocks) {
    const text = el.textContent?.trim() ?? ''
    if (!text) continue
    const tag = el.tagName.toLowerCase()
    const headingMatch = tag.match(/^h([1-6])$/)
    paragraphs.push({
      text,
      headingLevel: headingMatch ? parseInt(headingMatch[1], 10) : null,
      bold: el.querySelector('strong, b') !== null && el.children.length <= 1,
    })
  }
  return paragraphs
}

export function splitPrefix(text: string): { prefix: string; core: string } {
  const match = text.match(prefixPattern)
  if (!match) return { prefix: '', core: text }
  return { prefix: match[0], core: text.slice(match[0].length) }
}

export interface TranslatableCore {
  core: string
  isHeading: boolean
}

export function uniqueTranslatableCores(paragraphs: ExtractedParagraph[]): TranslatableCore[] {
  const seen = new Map<string, boolean>() // core -> isHeading (true if ANY occurrence is a heading)
  for (const p of paragraphs) {
    const { core } = splitPrefix(p.text)
    if (!isTranslatable(core)) continue
    const isHeading = Boolean(p.headingLevel)
    seen.set(core, (seen.get(core) ?? false) || isHeading)
  }
  return Array.from(seen.entries()).map(([core, isHeading]) => ({ core, isHeading }))
}

// Proper Unicode fonts per script — without this, Word/LibreOffice fall back
// to a default font that often lacks full Devanagari/Odia glyph coverage,
// causing missing conjuncts or tofu boxes. Noto ships full coverage for both.
const FONT_BY_LANGUAGE: Record<string, string> = {
  Hindi: "Noto Sans Devanagari",
  Sanskrit: "Noto Sans Devanagari",
  Odia: "Noto Sans Oriya",
  Bengali: "Noto Sans Bengali",
  Tamil: "Noto Sans Tamil",
  Telugu: "Noto Sans Telugu",
  Marathi: "Noto Sans Devanagari",
  Gujarati: "Noto Sans Gujarati",
}

export function fontForLanguage(targetLang: string): string | undefined {
  return FONT_BY_LANGUAGE[targetLang]
}

const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
}

export async function buildTranslatedDocx(
  paragraphs: ExtractedParagraph[],
  translatedCache: Map<string, string>,
  targetLang?: string,
): Promise<Blob> {
  const font = targetLang ? fontForLanguage(targetLang) : undefined

  const docParagraphs = paragraphs.map((p) => {
    const { prefix, core } = splitPrefix(p.text)
    let translatedCore = translatedCache.get(core) ?? core
    if (targetLang === 'Odia') translatedCore = fixOdiaOrthography(translatedCore)
    const finalText = prefix + translatedCore

    return new Paragraph({
      heading: p.headingLevel ? headingMap[p.headingLevel] : undefined,
      children: [
        new TextRun({
          text: finalText,
          bold: p.bold && !p.headingLevel,
          font: font,
        }),
      ],
    })
  })

  const doc = new Document({
    sections: [{ children: docParagraphs }],
  })

  return Packer.toBlob(doc)
}
