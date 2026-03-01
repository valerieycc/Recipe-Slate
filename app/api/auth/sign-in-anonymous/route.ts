import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  const user = data.user;
  if (!user) return NextResponse.json({ error: "No user" }, { status: 500 });
  return NextResponse.json({ user: { id: user.id } });
}
