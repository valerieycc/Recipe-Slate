import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { Recipe } from "@/lib/types";
import type { SavedRecipe } from "@/lib/storage";

const RETENTION_DAYS = 30;

function toSavedRecipe(row: { id: string; recipe: Recipe; saved_at: string; is_permanent: boolean }): SavedRecipe {
  return {
    ...row.recipe,
    id: row.id,
    savedAt: row.saved_at,
    isPermanent: row.is_permanent,
  };
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
    .from("saved_recipes")
    .select("id, recipe, saved_at, is_permanent")
    .eq("user_id", user.id)
    .order("saved_at", { ascending: false });
  if (error) {
    console.error("saved GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const now = Date.now();
  const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const valid = (rows ?? []).filter((r) => r.is_permanent || new Date(r.saved_at).getTime() >= cutoff);
  const list = valid.map((r) => toSavedRecipe({
    id: r.id,
    recipe: r.recipe as Recipe,
    saved_at: r.saved_at,
    is_permanent: r.is_permanent,
  }));
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
  const body = await request.json() as { recipe: Recipe; isPermanent: boolean };
  const { recipe, isPermanent } = body;
  if (!recipe || typeof isPermanent !== "boolean") {
    return NextResponse.json({ error: "Missing recipe or isPermanent" }, { status: 400 });
  }
  const { data: row, error } = await supabase
    .from("saved_recipes")
    .insert({
      user_id: user.id,
      recipe,
      is_permanent: isPermanent,
    })
    .select("id, recipe, saved_at, is_permanent")
    .single();
  if (error) {
    console.error("saved POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const saved = toSavedRecipe({
    id: row.id,
    recipe: row.recipe as Recipe,
    saved_at: row.saved_at,
    is_permanent: row.is_permanent,
  });
  return NextResponse.json(saved);
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
    .from("saved_recipes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("saved DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await request.json() as { id: string; isPermanent: boolean };
  const { id, isPermanent } = body;
  if (!id || typeof isPermanent !== "boolean") {
    return NextResponse.json({ error: "Missing id or isPermanent" }, { status: 400 });
  }
  const { error } = await supabase
    .from("saved_recipes")
    .update({ is_permanent: isPermanent })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("saved PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
