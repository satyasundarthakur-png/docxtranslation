import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { saveAs } from "file-saver";
import {
  extractParagraphs,
  uniqueTranslatableCores,
  buildTranslatedDocx,
  type ExtractedParagraph,
} from "@/lib/docx-pipeline";
import { maskText, unmaskText } from "@/lib/mask";
import { translateSegments } from "@/lib/translate.functions";
import { devanagariToIAST } from "@/lib/transliterate";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DocTongue — Structure-Preserving DOCX Translator" },
      {
        name: "description",
        content:
          "Translate Word documents into Hindi, Odia, Sanskrit, Tamil and more while preserving headings, numbers, formulas and protected terms.",
      },
      { property: "og:title", content: "DocTongue — Structure-Preserving DOCX Translator" },
      {
        property: "og:description",
        content:
          "Upload a .docx, pick a language, and get a translated document with headings, numbers and named entities intact.",
      },
      { property: "og:url", content: "https://docxtranslation.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://docxtranslation.lovable.app/" }],
  }),

  component: Index,
});

type Stage = "idle" | "extracting" | "translating" | "assembling" | "done" | "error";

const LANGUAGES = [
  "Hindi",
  "Odia",
  "Sanskrit",
  "Bengali",
  "Tamil",
  "Telugu",
  "Marathi",
  "Gujarati",
  "Spanish",
  "French",
];

function Index() {
  const [file, setFile] = useState<File | null>(null);
  const [targetLang, setTargetLang] = useState("Hindi");
  const [userTermsInput, setUserTermsInput] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [avgQuality, setAvgQuality] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [iastPreview, setIastPreview] = useState<string | null>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && dropped.name.endsWith(".docx")) setFile(dropped);
  }, []);

  const busy = stage === "extracting" || stage === "translating" || stage === "assembling";

  const runTranslation = async () => {
    if (!file) return;
    setErrorMsg("");
    setResultBlob(null);
    try {
      setStage("extracting");
      const paragraphs: ExtractedParagraph[] = await extractParagraphs(file);
      const translatableCores = uniqueTranslatableCores(paragraphs);
      const userTerms = userTermsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      setStage("translating");
      setProgress(0);

      const masked = translatableCores.map(({ core, isHeading }) =>
        maskText(core, userTerms, { skipCapitalizedPhraseHeuristic: isHeading }),
      );
      const maskedTexts = masked.map((m) => m.masked);
      const cores = translatableCores.map((tc) => tc.core);

      const batchSize = 20;
      const translatedCache = new Map<string, string>();
      const qualities: number[] = [];

      for (let i = 0; i < maskedTexts.length; i += batchSize) {
        const batchMasked = maskedTexts.slice(i, i + batchSize);
        const { results } = await translateSegments({
          data: { segments: batchMasked, targetLang, userTerms },
        });

        results.forEach((r, j) => {
          const globalIdx = i + j;
          const unmasked = unmaskText(r.translated, masked[globalIdx].tokenMap);
          translatedCache.set(cores[globalIdx], unmasked);
          qualities.push(r.quality);
        });

        setProgress(Math.min(100, Math.round(((i + batchMasked.length) / maskedTexts.length) * 100)));
        setAvgQuality(qualities.reduce((a, b) => a + b, 0) / (qualities.length || 1));
      }

      setStage("assembling");
      const blob = await buildTranslatedDocx(paragraphs, translatedCache, targetLang);
      setResultBlob(blob);
      if (targetLang === "Sanskrit") {
        setIastPreview(
          Array.from(translatedCache.values()).slice(0, 3).map(devanagariToIAST).join("\n\n"),
        );
      } else {
        setIastPreview(null);
      }
      setStage("done");
    } catch (e) {
      console.error(e);
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  };

  const download = () => {
    if (!resultBlob || !file) return;
    saveAs(resultBlob, file.name.replace(/\.docx$/i, `_${targetLang}.docx`));
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-14">
      {/* Ambient rainbow orbs */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full rainbow-orb" />
      <div
        className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full rainbow-orb"
        style={{ animationDirection: "reverse", animationDuration: "11s" }}
      />

      <div className="relative w-full max-w-xl">
        <header className="mb-10 text-center">
          <h1 className="rainbow-float font-serif text-4xl font-semibold tracking-tight rainbow-text sm:text-5xl">
            DocTongue — Structure-Preserving DOCX Translator
          </h1>
          <p className="mt-3 text-muted-foreground">
            Structure-preserving document translation for .docx files.
          </p>
        </header>


        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => document.getElementById("file-input")?.click()}
          className="rainbow-border cursor-pointer rounded-2xl bg-card/70 p-10 text-center backdrop-blur-sm transition-transform hover:scale-[1.01]"
        >
          <input
            id="file-input"
            type="file"
            accept=".docx"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <p className="font-medium text-foreground">{file.name}</p>
          ) : (
            <p className="text-muted-foreground">
              <span className="rainbow-dot inline-block">🌈</span> Drag a .docx file here, or click to browse
            </p>
          )}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="lang" className="mb-1 block text-sm text-muted-foreground">
              Target language
            </label>
            <select
              id="lang"
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {LANGUAGES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="terms" className="mb-1 block text-sm text-muted-foreground">
              Preserve terms (comma-separated)
            </label>
            <input
              id="terms"
              value={userTermsInput}
              onChange={(e) => setUserTermsInput(e.target.value)}
              placeholder="e.g. NEET, Ayurveda"
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <button
          onClick={runTranslation}
          disabled={!file || busy}
          className="rainbow-btn mt-6 w-full rounded-lg py-3 font-medium text-white shadow-lg transition-transform hover:scale-[1.01] disabled:opacity-40 disabled:hover:scale-100"
        >
          {busy ? "Working…" : "Translate document"}
        </button>

        {(stage === "translating" || stage === "assembling") && (
          <div className="mt-6">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="rainbow-progress h-2.5 rounded-full transition-all"
                style={{ width: `${stage === "assembling" ? 100 : progress}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {stage === "assembling"
                ? "Rebuilding document…"
                : `Translating… ${progress}% · avg quality ${avgQuality.toFixed(1)}/40`}
            </p>
          </div>
        )}

        {stage === "done" && (
          <div className="rainbow-border mt-6 flex items-center justify-between gap-4 rounded-lg bg-card/80 p-4 backdrop-blur-sm">
            <div>
              <p className="font-medium rainbow-text">Translation complete</p>
              <p className="text-sm text-muted-foreground">
                Average quality score: {avgQuality.toFixed(1)}/40
              </p>
            </div>
            <button
              onClick={download}
              className="rainbow-btn rounded-lg px-4 py-2 text-sm font-medium text-white shadow transition-transform hover:scale-105"
            >
              Download .docx
            </button>
          </div>
        )}

        {stage === "done" && iastPreview && (
          <div className="rainbow-border mt-4 rounded-lg bg-card/80 p-4 backdrop-blur-sm">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              IAST transliteration preview (first 3 segments)
            </p>
            <pre className="whitespace-pre-wrap font-serif text-sm text-foreground">{iastPreview}</pre>
          </div>
        )}

        {stage === "error" && (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMsg}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Headings, numbering, formulas and protected terms are preserved. Embedded images are not
          carried over — review documents with figures.
        </p>
      </div>
    </main>
  );
}
