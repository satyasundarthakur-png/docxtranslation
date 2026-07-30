import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { translateBatch } from "./translate.server";

const schema = z.object({
  segments: z.array(z.string()).min(1).max(40),
  targetLang: z.string().min(1).max(40),
  userTerms: z.array(z.string().max(80)).max(50).default([]),
});

export const translateSegments = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const results = await translateBatch(data.segments, data.targetLang, data.userTerms);
    return { results };
  });
