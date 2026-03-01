import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { Recipe } from "@/lib/types";
import type { RecentEntry } from "@/lib/storage";

const RECENT_MAX = 50;

function recentKey(recipe: Recipe): string {
  return [recipe.source ?? "", recipe.name].join("::");
}

function toRecentEntry(row: { id: string; recipe: Recipe; viewed_at: string }): RecentEntry {
  return { id: row.id, viewedAt: row.viewed_at, recipe: row.recipe };
}

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: rows, error } = await supabase
    .from("recent_recipes")
    .select("id, recipe, viewed_at")
    .eq("user_id", user.id)
    .order("viewed_at", { ascending: false })
    .limit(RECENT_MAX);
  if (error) {
    console.error("recent GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const list = (rows ?? []).map((r) => toRecentEntry({ id: r.id, recipe: r.recipe as Recipe, viewed_at: r.viewed_at }));
  return NextResponse.json(list);
}

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await request.json() as { recipe: Recipe };
  const { recipe } = body;
  if (!recipe) {
    return NextResponse.json({ error: "Missing recipe" }, { status: 400 });
  }
  const key = recentKey(recipe);
  const { data: allRows, error: fetchError } = await supabase
    .from("recent_recipes")
    .select("id, recipe, viewed_at")
    .eq("user_id", user.id)
    .order("viewed_at", { ascending: false });
  if (fetchError) {
    console.error("recent POST fetch error:", fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  const rows = allRows ?? [];
  const withoutDup = rows.filter((r) => recentKey(r.recipe as Recipe) !== key);
  const toRemove = rows.filter((r) => recentKey(r.recipe as Recipe) === key);
  for (const r of toRemove) {
    await supabase.from("recent_recipes").delete().eq("id", r.id).eq("user_id", user.id);
  }
  const { data: inserted, error: insertError } = await supabase
    .from("recent_recipes")
    .insert({ user_id: user.id, recipe })
    .select("id, recipe, viewed_at")
    .single();
  if (insertError) {
    console.error("recent POST insert error:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  const entry = toRecentEntry({ id: inserted.id, recipe: inserted.recipe as Recipe, viewed_at: inserted.viewed_at });
  const finalCount = withoutDup.length + 1;
  if (finalCount > RECENT_MAX) {
    const toDelete = withoutDup.slice(RECENT_MAX - 1);
    for (const r of toDelete) {
      await supabase.from("recent_recipes").delete().eq("id", r.id).eq("user_id", user.id);
    }
  }
  return NextResponse.json(entry);
}

export async function DELETE(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const { error } = await supabase
    .from("recent_recipes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("recent DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
