"use client";

import { useState, useEffect } from "react";
import type { Recipe } from "@/lib/types";
import type { SavedRecipe } from "@/lib/storage";
import {
  getSavedRecipes,
  saveRecipe,
  deleteSavedRecipe,
  setPermanent,
  daysUntilExpiry,
} from "@/lib/storage";
import { useLocale } from "./LocaleProvider";
import { RecipeView } from "./RecipeView";
import { LOCALES } from "@/lib/i18n";

type Mode = "choose" | "url" | "photo";
type View = "home" | "recipe" | "saved-list";

export default function Home() {
  const { t, locale, setLocale } = useLocale();
  const [mode, setMode] = useState<Mode>("choose");
  const [view, setView] = useState<View>("home");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [currentSaved, setCurrentSaved] = useState<SavedRecipe | null>(null);
  const [savedList, setSavedList] = useState<SavedRecipe[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [translatedRecipe, setTranslatedRecipe] = useState<Recipe | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);

  useEffect(() => {
    setSavedList(getSavedRecipes());
  }, []);

  useEffect(() => {
    if (!recipe || !locale) {
      setTranslatedRecipe(null);
      return;
    }
    let cancelled = false;
    setTranslationLoading(true);
    fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipe: {
          name: recipe.name,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          notes: recipe.notes,
        },
        target: locale,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.recipe) {
          setTranslatedRecipe({
            ...recipe,
            name: data.recipe.name,
            ingredients: data.recipe.ingredients ?? recipe.ingredients,
            instructions: data.recipe.instructions ?? recipe.instructions,
            notes: data.recipe.notes ?? recipe.notes,
          });
        } else {
          setTranslatedRecipe(null);
        }
      })
      .catch(() => {
        if (!cancelled) setTranslatedRecipe(null);
      })
      .finally(() => {
        if (!cancelled) setTranslationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recipe, locale]);

  function refreshSavedList() {
    setSavedList(getSavedRecipes());
  }

  async function handleSubmitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/recipe/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load recipe");
      setRecipe(data);
      setCurrentSaved(null);
      setView("recipe");
      setMode("choose");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/recipe/photo", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to read recipe");
      setRecipe(data);
      setCurrentSaved(null);
      setView("recipe");
      setMode("choose");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
    e.target.value = "";
  }

  function clearRecipe() {
    setRecipe(null);
    setCurrentSaved(null);
    setTranslatedRecipe(null);
    setView("home");
    setError(null);
    setSaveMenuOpen(false);
  }

  function handleSaveRecipe(isPermanent: boolean) {
    if (!recipe) return;
    const saved = saveRecipe(recipe, isPermanent);
    setCurrentSaved(saved);
    setSaveMenuOpen(false);
    refreshSavedList();
  }

  function openSavedRecipe(item: SavedRecipe) {
    setRecipe(item);
    setCurrentSaved(item);
    setView("recipe");
  }

  function handleRemoveFromSaved() {
    if (!currentSaved) return;
    deleteSavedRecipe(currentSaved.id);
    setRecipe(null);
    setCurrentSaved(null);
    setView("home");
    refreshSavedList();
  }

  function handleKeepPermanent() {
    if (!currentSaved) return;
    setPermanent(currentSaved.id, true);
    setCurrentSaved({ ...currentSaved, isPermanent: true });
    refreshSavedList();
  }

  function goToSavedList() {
    setView("saved-list");
    setRecipe(null);
    setCurrentSaved(null);
    refreshSavedList();
  }

  const showingRecipe = view === "recipe" && recipe;
  const isSaved = currentSaved != null;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--background)]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-5 py-4 sm:px-8">
          <h1 className="text-lg font-medium tracking-tight text-[var(--foreground)]">
            {t("appTitle")}
          </h1>
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangOpen((o) => !o)}
                className="rounded-md px-2 py-1.5 text-sm text-[var(--muted)] hover:bg-stone-200/60 hover:text-[var(--foreground)]"
                aria-label="Language"
                aria-expanded={langOpen}
              >
                {LOCALES.find((l) => l.value === locale)?.label ?? locale}
              </button>
              {langOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden
                    onClick={() => setLangOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-[var(--border)] bg-white py-1">
                    {LOCALES.map((l) => (
                      <button
                        key={l.value}
                        type="button"
                        onClick={() => {
                          setLocale(l.value);
                          setLangOpen(false);
                        }}
                        className={`block w-full px-4 py-2 text-left text-sm ${
                          locale === l.value
                            ? "bg-stone-100 font-medium text-[var(--foreground)]"
                            : "text-[var(--muted)] hover:bg-stone-50"
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => (view === "saved-list" ? setView("home") : goToSavedList())}
              className={`rounded-md px-3 py-1.5 text-sm ${
                view === "saved-list"
                  ? "bg-stone-200/70 text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:bg-stone-200/50 hover:text-[var(--foreground)]"
              }`}
            >
              {t("savedRecipes")}{savedList.length > 0 ? ` (${savedList.length})` : ""}
            </button>
            {showingRecipe && (
              <button
                type="button"
                onClick={clearRecipe}
                className="rounded-md px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-stone-200/50 hover:text-[var(--foreground)]"
              >
                {t("newRecipe")}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
        {view === "saved-list" && (
          <SavedList
            list={savedList}
            onOpen={openSavedRecipe}
            onDelete={(id) => {
              deleteSavedRecipe(id);
              refreshSavedList();
            }}
            onBack={() => setView("home")}
            t={t}
            daysUntilExpiry={daysUntilExpiry}
          />
        )}

        {showingRecipe && (
          <>
            {translationLoading && (
              <p className="mb-3 text-sm text-[var(--muted)]">
                {t("translating")}
              </p>
            )}
            <RecipeView recipe={translatedRecipe ?? recipe!} />
            <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-[var(--border-subtle)] pt-6">
              {isSaved ? (
                <>
                  <span className="text-sm text-[var(--muted)]">
                    {currentSaved.isPermanent
                      ? t("savedPermanently")
                      : t("expiresInDays", { days: daysUntilExpiry(currentSaved)! })}
                  </span>
                  {!currentSaved.isPermanent && (
                    <button
                      type="button"
                      onClick={handleKeepPermanent}
                      className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-stone-50"
                    >
                      {t("keepPermanently")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRemoveFromSaved}
                    className="text-sm text-[var(--muted)] underline hover:text-[var(--foreground)]"
                  >
                    {t("removeFromSaved")}
                  </button>
                </>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setSaveMenuOpen((o) => !o)}
                    className="rounded-md border border-[var(--foreground)]/80 bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90"
                  >
                    {t("saveRecipe")}
                  </button>
                  {saveMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        aria-hidden
                        onClick={() => setSaveMenuOpen(false)}
                      />
                      <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-[var(--border)] bg-white py-1">
                        <button
                          type="button"
                          onClick={() => handleSaveRecipe(false)}
                          className="block w-full px-4 py-2 text-left text-sm text-[var(--foreground)] hover:bg-stone-50"
                        >
                          {t("saveFor30Days")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveRecipe(true)}
                          className="block w-full px-4 py-2 text-left text-sm text-[var(--foreground)] hover:bg-stone-50"
                        >
                          {t("savePermanently")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {view === "home" && !showingRecipe && (
          <>
            {error && (
              <div
                role="alert"
                className="mb-5 rounded-md border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900"
              >
                {error}
              </div>
            )}

            {mode === "choose" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMode("url")}
                  className="flex flex-col items-center gap-4 rounded-[0.5rem] border border-[var(--border)] bg-white p-8 text-left transition hover:border-stone-300/80"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100/80 text-[var(--muted)]">
                    <LinkIcon />
                  </span>
                  <span className="font-medium text-[var(--foreground)]">
                    {t("importFromUrl")}
                  </span>
                  <span className="text-center text-sm text-[var(--muted)] leading-relaxed">
                    {t("importFromUrlDesc")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("photo")}
                  className="flex flex-col items-center gap-4 rounded-[0.5rem] border border-[var(--border)] bg-white p-8 text-left transition hover:border-stone-300/80"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100/80 text-[var(--muted)]">
                    <CameraIcon />
                  </span>
                  <span className="font-medium text-[var(--foreground)]">
                    {t("importFromPhoto")}
                  </span>
                  <span className="text-center text-sm text-[var(--muted)] leading-relaxed">
                    {t("importFromPhotoDesc")}
                  </span>
                </button>
              </div>
            )}

            {mode === "url" && (
              <div className="max-w-xl">
                <button
                  type="button"
                  onClick={() => setMode("choose")}
                  className="mb-5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  ← {t("back")}
                </button>
                <form onSubmit={handleSubmitUrl} className="space-y-5">
                  <label className="block text-sm font-medium text-[var(--foreground)]">
                    {t("recipeUrl")}
                  </label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://cooking.nytimes.com/recipes/..."
                    className="w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400/50"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-md bg-[var(--foreground)] px-4 py-3 font-medium text-[var(--background)] hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? t("loading") : t("importRecipe")}
                  </button>
                </form>
              </div>
            )}

            {mode === "photo" && (
              <div className="max-w-xl">
                <button
                  type="button"
                  onClick={() => setMode("choose")}
                  className="mb-5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  ← {t("back")}
                </button>
                <label className="flex cursor-pointer flex-col items-center gap-5 rounded-[0.5rem] border-2 border-dashed border-[var(--border)] bg-white p-10 transition hover:border-stone-300/80 hover:bg-stone-50/30">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-100/80 text-[var(--muted)]">
                    <CameraIcon />
                  </span>
                  <span className="font-medium text-[var(--foreground)]">
                    {t("choosePhotoDesc")}
                  </span>
                  <span className="text-center text-sm text-[var(--muted)] leading-relaxed">
                    {t("photoFormatHint")}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoUpload}
                    disabled={loading}
                    className="hidden"
                  />
                </label>
                {loading && (
                  <p className="mt-5 text-center text-sm text-[var(--muted)]">
                    {t("readingImage")}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SavedList({
  list,
  onOpen,
  onDelete,
  onBack,
  t,
  daysUntilExpiry,
}: {
  list: SavedRecipe[];
  onOpen: (item: SavedRecipe) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  daysUntilExpiry: (item: SavedRecipe) => number | null;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        ← {t("back")}
      </button>
      <h2 className="mb-6 text-xl font-medium tracking-tight text-[var(--foreground)]">
        {t("savedListTitle")}
      </h2>
      {list.length === 0 ? (
        <p className="rounded-[0.5rem] border border-[var(--border)] bg-white p-8 text-center text-[var(--muted)] leading-relaxed">
          {t("noSavedRecipes")}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((item) => {
            const days = daysUntilExpiry(item);
            return (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-[0.5rem] border border-[var(--border)] bg-white px-4 py-3"
              >
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className="min-w-0 flex-1 text-left font-medium text-[var(--foreground)] hover:text-stone-600"
                >
                  {item.name}
                </button>
                <span className="shrink-0 text-sm text-[var(--muted)]">
                  {item.isPermanent ? t("permanent") : t("expiresInDays", { days: days ?? 0 })}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  className="shrink-0 rounded p-1.5 text-[var(--muted)] hover:bg-stone-100 hover:text-red-700/90"
                  aria-label={t("removeFromSavedAria")}
                >
                  <TrashIcon />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LinkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
