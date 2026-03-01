import type { Recipe } from "./types";

const STORAGE_KEY = "recipe-slate-saved";
const RETENTION_DAYS = 30;

export interface SavedRecipe extends Recipe {
  id: string;
  savedAt: string;
  isPermanent: boolean;
}

function loadRaw(): SavedRecipe[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedRecipe[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(list: SavedRecipe[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("Failed to save recipes", e);
  }
}

function isExpired(item: SavedRecipe): boolean {
  if (item.isPermanent) return false;
  const saved = new Date(item.savedAt).getTime();
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return saved < cutoff;
}

/** Returns saved recipes and removes any expired (non-permanent) ones. */
export function getSavedRecipes(): SavedRecipe[] {
  const list = loadRaw();
  const valid = list.filter((r) => !isExpired(r));
  if (valid.length !== list.length) save(valid);
  return valid;
}

export function saveRecipe(recipe: Recipe, isPermanent: boolean): SavedRecipe {
  const list = getSavedRecipes();
  const id = crypto.randomUUID();
  const savedAt = new Date().toISOString();
  const saved: SavedRecipe = { ...recipe, id, savedAt, isPermanent };
  list.push(saved);
  save(list);
  return saved;
}

export function deleteSavedRecipe(id: string): void {
  const list = getSavedRecipes().filter((r) => r.id !== id);
  save(list);
}

export function setPermanent(id: string, isPermanent: boolean): void {
  const list = getSavedRecipes();
  const index = list.findIndex((r) => r.id === id);
  if (index === -1) return;
  list[index] = { ...list[index], isPermanent };
  save(list);
}

export function getSavedRecipe(id: string): SavedRecipe | null {
  return getSavedRecipes().find((r) => r.id === id) ?? null;
}

export function daysUntilExpiry(item: SavedRecipe): number | null {
  if (item.isPermanent) return null;
  const saved = new Date(item.savedAt).getTime();
  const expiresAt = saved + RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const days = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, days);
}

// ——— Recently browsed (automatic history; distinct from saved) ———

const RECENT_KEY = "recipe-slate-recent";
const RECENT_MAX = 50;

export interface RecentEntry {
  id: string;
  viewedAt: string;
  recipe: Recipe;
}

function loadRecentRaw(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecent(list: RecentEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("Failed to save recent", e);
  }
}

/** Dedupe key: same recipe = same source+name (or name if no source). */
function recentKey(recipe: Recipe): string {
  return [recipe.source ?? "", recipe.name].join("::");
}

export function getRecentRecipes(): RecentEntry[] {
  return loadRecentRaw();
}

export function addToRecent(recipe: Recipe): void {
  const list = loadRecentRaw();
  const key = recentKey(recipe);
  const viewedAt = new Date().toISOString();
  const without = list.filter((e) => recentKey(e.recipe) !== key);
  const entry: RecentEntry = { id: crypto.randomUUID(), viewedAt, recipe };
  const next = [entry, ...without].slice(0, RECENT_MAX);
  saveRecent(next);
}

export function removeFromRecent(id: string): void {
  const list = loadRecentRaw().filter((e) => e.id !== id);
  saveRecent(list);
}
