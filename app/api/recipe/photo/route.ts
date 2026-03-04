import { NextResponse } from "next/server";
import sharp from "sharp";
import type { Recipe } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

const PHOTO_IMPORT_LIMIT_PER_MONTH = 5;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MAX_EDGE = 1024;

const VISION_PROMPT = `You are a recipe extractor. Look at this image of a recipe (cookbook page, screenshot, or photo). Extract the recipe into structured data.

Reply with ONLY a single JSON object, no markdown or explanation. Use EITHER the "sections" format OR the simple "ingredients" format:

OPTION A – Recipe has multiple ingredient sections (e.g. "For the dumplings", "For the ragout", "For the sauce"):
{
  "name": "Recipe title",
  "ingredientSections": [
    { "title": "For the dumplings", "items": ["1 kg potatoes", "salt", "..."] },
    { "title": "For the ragout", "items": ["1 onion", "600 g mushrooms", "..."] }
  ],
  "instructions": ["step 1", "step 2", ...]
}

OPTION B – Recipe has a single list of ingredients (no subsections):
{
  "name": "Recipe title",
  "ingredients": ["ingredient 1", "ingredient 2", ...],
  "instructions": ["step 1", "step 2", ...]
}

Rules:
- name: Use the EXACT recipe title from the book or page when visible. Only use "Recipe from photo" when the title is truly unreadable or missing.
- When the page has separate ingredient blocks with headings (e.g. "Für die Knödel", "Für das Ragout", "For the sauce"), use ingredientSections with a title and items array for each. Preserve the section titles from the image.
- When there is only one ingredient list, use ingredients (array of strings). Include amounts and units. Preserve the language used in the image.
- instructions: Array of strings. One string per step, in order. Keep steps clear and complete.
- If the image is not a recipe or is unreadable, return: name "Recipe from photo", ingredients ["(Could not read ingredients)"], instructions ["(Could not read instructions)"].
- Output only valid JSON.`;

function isGenericTitle(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n || n.length < 4) return true;
  if (n === "recipe from photo" || n === "recipe from text") return true;
  return false;
}

async function suggestRecipeTitle(
  ingredients: string[],
  instructions: string[],
  apiKey: string
): Promise<string> {
  const preview = [
    "Ingredients:",
    ingredients.slice(0, 8).join("\n"),
    "Instructions:",
    instructions.slice(0, 3).join(" "),
  ].join("\n");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Suggest a short, descriptive recipe title (e.g. "Potato Dumplings with Mushroom Ragout" or "Herb Soup") based on this recipe. Reply with ONLY the title, no quotes or punctuation at the end.\n\n${preview.slice(0, 1500)}`,
        },
      ],
      max_tokens: 60,
      temperature: 0.3,
    }),
  });
  if (!res.ok) return "";
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const title = data?.choices?.[0]?.message?.content?.trim();
  return title && title.length > 1 && title.length < 120 ? title : "";
}

export async function POST(request: Request) {
  const userKey = request.headers.get("X-OpenAI-API-Key")?.trim();
  const apiKey = userKey || OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Photo import needs an OpenAI API key. Add OPENAI_API_KEY in your server environment, or add your own key in Settings (photo import will use your account).",
      },
      { status: 503 }
    );
  }

  const usingServerKey = !userKey;
  let usageIdentifier: string | null = null;
  if (usingServerKey) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      usageIdentifier = user.id;
    } else {
      const anonId = request.headers.get("X-Photo-Import-Id")?.trim();
      if (anonId) usageIdentifier = `anon:${anonId}`;
    }
    if (!usageIdentifier) {
      return NextResponse.json(
        {
          error:
            "Log in or allow this app to identify your device (Settings) to use the free 5 photo imports per month.",
          errorCode: "NEED_IDENTIFIER",
        },
        { status: 400 }
      );
    }
    const admin = getAdminClient();
    if (admin) {
      const month = new Date().toISOString().slice(0, 7);
      const { data: row } = await admin
        .from("photo_import_usage")
        .select("count")
        .eq("identifier", usageIdentifier)
        .eq("month", month)
        .maybeSingle();
      const count = row?.count ?? 0;
      if (count >= PHOTO_IMPORT_LIMIT_PER_MONTH) {
        return NextResponse.json(
          {
            error:
              "You've used your 5 free photo imports this month. Add your own OpenAI API key in Settings, or subscribe for more.",
            errorCode: "LIMIT_REACHED",
            limit: PHOTO_IMPORT_LIMIT_PER_MONTH,
          },
          { status: 429 }
        );
      }
    }
  }

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

    let imageBuffer: Buffer;
    try {
      const meta = await sharp(buffer).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (w > MAX_EDGE || h > MAX_EDGE) {
        imageBuffer = await sharp(buffer)
          .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
      } else {
        imageBuffer = await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
      }
    } catch {
      imageBuffer = buffer;
    }

    const base64 = imageBuffer.toString("base64");
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return NextResponse.json(
        { error: err?.error?.message ?? res.statusText ?? "Vision request failed" },
        { status: res.status >= 500 ? 502 : 422 }
      );
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 502 }
      );
    }

    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as {
      name?: string;
      ingredients?: string[];
      ingredientSections?: { title?: string; items?: string[] }[];
      instructions?: string[];
    };

    const ingredients: string[] = [];
    let ingredientSections: { title: string; items: string[] }[] | undefined;

    if (Array.isArray(parsed.ingredientSections) && parsed.ingredientSections.length > 0) {
      ingredientSections = parsed.ingredientSections
        .filter((s): s is { title?: string; items?: string[] } => s && typeof s === "object")
        .map((s) => ({
          title: typeof s.title === "string" ? s.title : "Ingredients",
          items: Array.isArray(s.items) ? s.items.filter((x): x is string => typeof x === "string") : [],
        }))
        .filter((s) => s.items.length > 0);
      for (const sec of ingredientSections) ingredients.push(...sec.items);
    }
    if (ingredients.length === 0 && Array.isArray(parsed.ingredients)) {
      ingredients.push(...parsed.ingredients.filter((x): x is string => typeof x === "string"));
    }
    if (ingredients.length === 0) ingredients.push("(Could not read ingredients)");

    const recipe: Recipe = {
      name: typeof parsed.name === "string" ? parsed.name : "Recipe from photo",
      ingredients,
      instructions: Array.isArray(parsed.instructions)
        ? parsed.instructions.filter((x): x is string => typeof x === "string")
        : ["(Could not read instructions)"],
    };
    if (ingredientSections?.length) recipe.ingredientSections = ingredientSections;

    if (isGenericTitle(recipe.name) && recipe.ingredients.length > 0 && recipe.instructions.length > 0) {
      const suggested = await suggestRecipeTitle(
        recipe.ingredients,
        recipe.instructions,
        apiKey
      );
      if (suggested) recipe.name = suggested;
    }

    if (usingServerKey && usageIdentifier) {
      const admin = getAdminClient();
      if (admin) {
        const month = new Date().toISOString().slice(0, 7);
        const { data: row } = await admin
          .from("photo_import_usage")
          .select("count")
          .eq("identifier", usageIdentifier)
          .eq("month", month)
          .maybeSingle();
        const nextCount = (row?.count ?? 0) + 1;
        await admin
          .from("photo_import_usage")
          .upsert({ identifier: usageIdentifier, month, count: nextCount }, { onConflict: "identifier,month" });
      }
    }

    return NextResponse.json(recipe);
  } catch (err) {
    console.error("Recipe photo vision error:", err);
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        { error: "AI returned invalid recipe format" },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to extract recipe from image" },
      { status: 500 }
    );
  }
}
