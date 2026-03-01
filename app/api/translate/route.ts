import { NextResponse } from "next/server";
import type { Locale } from "@/lib/i18n";
import type { Recipe } from "@/lib/types";

const LIBRETRANSLATE_URL = "https://libretranslate.com/translate";
const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const MAX_CHARS = 2000;
const MYMEMORY_MAX_BYTES = 450;
const DELIM = "\n";

const LOCALE_TO_CODE: Record<Locale, string> = {
  en: "en",
  de: "de",
  zh: "zh-TW",
  ko: "ko",
};

function detectSourceCode(text: string): string {
  if (/[\u4e00-\u9fff\u3100-\u312f]/.test(text)) return "zh-TW";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (/[\u0600-\u06ff]/.test(text)) return "ar";
  return "en";
}

async function myMemoryTranslate(
  text: string,
  sourceCode: string,
  targetCode: string
): Promise<string> {
  if (!text.trim()) return text;
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= MYMEMORY_MAX_BYTES) {
    const res = await fetch(
      `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=${sourceCode}|${targetCode}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return text;
    const data = (await res.json()) as { responseData?: { translatedText?: string } };
    return data.responseData?.translatedText ?? text;
  }
  const parts: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + 100, text.length);
    while (end < text.length && encoder.encode(text.slice(pos, end)).length < MYMEMORY_MAX_BYTES) end += 50;
    const chunk = text.slice(pos, end);
    const res = await fetch(
      `${MYMEMORY_URL}?q=${encodeURIComponent(chunk)}&langpair=${sourceCode}|${targetCode}`,
      { signal: AbortSignal.timeout(10000) }
    );
    parts.push(res.ok ? ((await res.json()) as { responseData?: { translatedText?: string } }).responseData?.translatedText ?? chunk : chunk);
    pos = end;
  }
  return parts.join("");
}

async function libreTranslate(
  text: string,
  targetCode: string,
  apiKey?: string
): Promise<string> {
  const chunk = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  const res = await fetch(LIBRETRANSLATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: chunk,
      source: "auto",
      target: targetCode,
      format: "text",
      ...(apiKey && { api_key: apiKey }),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`LibreTranslate ${res.status}`);
  const data = (await res.json()) as { translatedText?: string };
  return data.translatedText ?? chunk;
}

async function translateText(
  text: string,
  targetCode: string,
  sourceCode: string,
  apiKey?: string
): Promise<string> {
  if (!text.trim()) return text;
  try {
    return await libreTranslate(text, targetCode, apiKey);
  } catch {
    return myMemoryTranslate(text, sourceCode, targetCode);
  }
}

async function translateLines(
  lines: string[],
  targetCode: string,
  sourceCode: string,
  apiKey?: string
): Promise<string[]> {
  if (!lines.length) return [];
  const joined = lines.join(DELIM);
  try {
    const out = await libreTranslate(joined, targetCode, apiKey);
    const split = out.split(DELIM).map((t) => t.trim()).filter(Boolean);
    if (split.length >= lines.length * 0.8) return split.length === lines.length ? split : lines.map((_, i) => split[i] ?? lines[i]);
    throw new Error("Split count mismatch");
  } catch {
    return Promise.all(lines.map((line) => translateText(line, targetCode, sourceCode, apiKey)));
  }
}

function likelyNeedsTranslation(text: string, target: Locale): boolean {
  const hasCJK = /[\u4e00-\u9fff\u3100-\u312f\uac00-\ud7af]/.test(text);
  const hasCyrillic = /[\u0400-\u04ff]/.test(text);
  const hasArabic = /[\u0600-\u06ff]/.test(text);
  if (target === "en" && (hasCJK || hasCyrillic || hasArabic)) return true;
  if (target === "de" && (hasCJK || hasCyrillic || hasArabic)) return true;
  if (target === "zh" || target === "ko") {
    const mainlyLatin = /^[\x00-\x7f\s\u00c0-\u024f.,;:!?'"-]+$/u.test(text.trim());
    if (mainlyLatin && text.trim().length > 20) return true;
  }
  return false;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: string;
      target?: Locale;
      recipe?: Pick<Recipe, "name" | "ingredients" | "instructions" | "notes">;
    };
    const target = body.target ?? "en";
    const code = LOCALE_TO_CODE[target];
    if (!code) {
      return NextResponse.json({ error: "Invalid target language" }, { status: 400 });
    }
    const apiKey = process.env.LIBRETRANSLATE_API_KEY;

    if (body.recipe) {
      const { name, ingredients, instructions, notes } = body.recipe;
      const sample = [name, ingredients?.[0] ?? "", instructions?.[0] ?? ""].join(" ");
      if (!likelyNeedsTranslation(sample, target)) {
        return NextResponse.json({
          recipe: {
            name: body.recipe.name,
            ingredients: body.recipe.ingredients ?? [],
            instructions: body.recipe.instructions ?? [],
            notes: body.recipe.notes,
          },
        });
      }
      const sourceCode = detectSourceCode(sample);

      const [translatedName, ingredientsBlock, instructionsBlock, translatedNotes] =
        await Promise.all([
          name ? translateText(name, code, sourceCode, apiKey) : Promise.resolve(""),
          ingredients?.length
            ? translateLines(ingredients, code, sourceCode, apiKey)
            : Promise.resolve([] as string[]),
          instructions?.length
            ? translateLines(instructions, code, sourceCode, apiKey)
            : Promise.resolve([] as string[]),
          notes ? translateText(notes, code, sourceCode, apiKey) : Promise.resolve(undefined),
        ]);
      return NextResponse.json({
        recipe: {
          name: translatedName || name,
          ingredients: ingredientsBlock.length ? ingredientsBlock : ingredients ?? [],
          instructions: instructionsBlock.length ? instructionsBlock : instructions ?? [],
          notes: translatedNotes ?? notes,
        },
      });
    }

    if (body.text != null) {
      const sourceCode = detectSourceCode(body.text);
      const translated = await translateText(body.text, code, sourceCode, apiKey);
      return NextResponse.json({ translatedText: translated });
    }

    return NextResponse.json(
      { error: "Provide text or recipe" },
      { status: 400 }
    );
  } catch (err) {
    console.error("Translate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Translation failed" },
      { status: 500 }
    );
  }
}
