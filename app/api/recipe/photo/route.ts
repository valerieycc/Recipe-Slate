import { NextResponse } from "next/server";
import Tesseract from "tesseract.js";
import type { Recipe } from "@/lib/types";

function parseOcrIntoRecipe(fullText: string): Recipe {
  const text = fullText.trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const title =
    lines.find((l) => l.length > 2 && l.length < 120 && !/^\d+[\.\)]/.test(l)) ??
    "Recipe from photo";

  const lower = text.toLowerCase();
  const hasIngredients =
    lower.includes("ingredient") ||
    lower.includes("ingredients") ||
    lower.includes("for the");
  const hasInstructions =
    lower.includes("instruction") ||
    lower.includes("directions") ||
    lower.includes("method") ||
    lower.includes("steps") ||
    lower.includes("preparation");

  let ingredients: string[] = [];
  let instructions: string[] = [];

  if (hasIngredients || hasInstructions) {
    const sections: { key: string; start: number }[] = [];
    const markers = [
      "ingredients",
      "ingredient",
      "for the",
      "instructions",
      "instruction",
      "directions",
      "direction",
      "method",
      "steps",
      "preparation",
    ];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      for (const m of markers) {
        if (line === m || line.startsWith(m + ":") || line.startsWith(m + " ")) {
          sections.push({ key: m, start: i });
          break;
        }
      }
    }
    sections.sort((a, b) => a.start - b.start);

    const ingMarkers = ["ingredients", "ingredient", "for the"];
    const instMarkers = [
      "instructions",
      "instruction",
      "directions",
      "direction",
      "method",
      "steps",
      "preparation",
    ];

    let ingStart = -1;
    let instStart = -1;
    for (const s of sections) {
      if (ingMarkers.some((m) => s.key.startsWith(m)) && ingStart === -1)
        ingStart = s.start;
      if (instMarkers.some((m) => s.key.startsWith(m)) && instStart === -1)
        instStart = s.start;
    }

    if (ingStart >= 0) {
      const end =
        instStart >= 0 ? Math.min(instStart, lines.length) : lines.length;
      ingredients = lines
        .slice(ingStart + 1, end)
        .filter(
          (l) =>
            l.length > 1 &&
            (/\d|cup|tbsp|tsp|oz|lb|clove|pinch|salt|pepper|garlic|onion/i.test(
              l
            ) ||
              /^[•\-\*]\s/.test(l) ||
              /^\d+[\.\)]\s/.test(l))
        );
    }
    if (instStart >= 0) {
      instructions = lines
        .slice(instStart + 1)
        .filter(
          (l) =>
            l.length > 10 &&
            (/^\d+[\.\)]\s/.test(l) ||
              /^[•\-\*]\s/.test(l) ||
              /^step\s/i.test(l) ||
              l.length > 20)
        );
    }
  }

  if (ingredients.length === 0 && instructions.length === 0) {
    const bulletLines = lines.filter(
      (l) =>
        /^[•\-\*]\s/.test(l) ||
        /^\d+[\.\)]\s/.test(l) ||
        /^\d+\./.test(l)
    );
    const firstNum = bulletLines.findIndex((l) => /^\d+[\.\)]\s/.test(l));
    if (firstNum >= 0) {
      instructions = bulletLines.slice(firstNum).filter((l) => l.length > 5);
      ingredients = bulletLines.slice(0, firstNum).filter((l) => l.length > 2);
    } else {
      ingredients = lines.filter(
        (l) =>
          l.length > 2 &&
          l.length < 120 &&
          (/\d|cup|tbsp|tsp|oz|clove|salt|pepper/i.test(l) ||
            /^[•\-\*]\s/.test(l))
      );
      instructions = lines.filter(
        (l) =>
          l.length > 25 &&
          (/^\d+[\.\)]\s/.test(l) || /^step\s/i.test(l) || l.includes("."))
      );
    }
  }

  return {
    name: title,
    ingredients: ingredients.length ? ingredients : ["(Check photo for ingredients)"],
    instructions: instructions.length
      ? instructions
      : ["(Check photo for instructions)"],
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;
    if (!file || !file.size) {
      return NextResponse.json(
        { error: "Missing image file" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const {
      data: { text },
    } = await Tesseract.recognize(buffer, "eng", {
      logger: () => {},
    });

    const recipe = parseOcrIntoRecipe(text ?? "");
    return NextResponse.json(recipe);
  } catch (err) {
    console.error("Recipe photo OCR error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to extract recipe from image",
      },
      { status: 500 }
    );
  }
}
