# DocTongue

Structure-preserving AI document translation for .docx files — Hindi, Odia,
Sanskrit, Bengali, Tamil, Telugu, Marathi, Gujarati, Spanish, and French.

Built with React, Vite, TanStack Start, and Supabase Edge Functions, powered
by Groq (`openai/gpt-oss-120b`).

## Features

- Masking-based translation that protects named entities, user-defined terms,
  numbers, and formulas from being altered
- Quality-scored retry loop (0–40 scale, retries below threshold)
- Unicode-correct fonts per script in the output docx (Noto Sans Devanagari,
  Oriya, Bengali, Tamil, Telugu, Gujarati)
- Sanskrit-aware translation mode: preserves śloka/verse line breaks and
  classical register, with an IAST transliteration preview
- Heading and paragraph-level formatting preserved on rebuild

## Setup

\`\`\`bash
npm install
\`\`\`

Create a Supabase project, deploy the edge function, and set your Groq key:

\`\`\`bash
supabase functions deploy translate-document
supabase secrets set GROQ_API_KEY=gsk_...
\`\`\`

Copy \`.env.example\` to \`.env\` and fill in your Supabase project URL and anon key.

\`\`\`bash
npm run dev
\`\`\`

Deploy via [Lovable](https://lovable.dev) — push to GitHub, import the repo,
set the \`VITE_SUPABASE_*\` env vars in project settings, then Publish.

## Known limitations

- No spaCy-grade named entity recognition in the browser — entity protection
  relies on a capitalized-phrase heuristic plus your explicit "preserve
  terms" list.
- Embedded images/diagrams in the source docx are not carried over to the
  output — review documents with figures before finalizing.
- Tables and headers/footers are not yet extracted — only top-level
  paragraphs.
