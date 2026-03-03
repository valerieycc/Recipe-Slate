"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Recipe } from "@/lib/types";
import type { SavedRecipe, RecentEntry } from "@/lib/storage";
import {
  getSavedRecipes,
  saveRecipe,
  deleteSavedRecipe,
  setPermanent,
  daysUntilExpiry,
  getRecentRecipes,
  addToRecent,
  removeFromRecent,
} from "@/lib/storage";
import { useLocale } from "./LocaleProvider";
import { RecipeView } from "./RecipeView";
import { LOCALES } from "@/lib/i18n";

type Mode = "choose" | "url" | "photo";
type View = "home" | "recipe" | "saved-list" | "recent-list";
type AuthUser = { id: string; email?: string };

export default function Home() {
  const { t, locale, setLocale } = useLocale();
  const [mode, setMode] = useState<Mode>("choose");
  const [view, setView] = useState<View>("home");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [currentSaved, setCurrentSaved] = useState<SavedRecipe | null>(null);
  const [savedList, setSavedList] = useState<SavedRecipe[]>([]);
  const [recentList, setRecentList] = useState<RecentEntry[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [photoProgress, setPhotoProgress] = useState(0);
  const [photoStep, setPhotoStep] = useState(0);
  const photoProgressRef = useRef<{ progress: ReturnType<typeof setInterval>; step: ReturnType<typeof setInterval> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [translatedRecipe, setTranslatedRecipe] = useState<Recipe | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const fetchSavedFromServer = useCallback(async () => {
    const res = await fetch("/api/saved");
    if (!res.ok) return;
    const data = await res.json();
    setSavedList(Array.isArray(data) ? data : []);
  }, []);
  const fetchRecentFromServer = useCallback(async () => {
    const res = await fetch("/api/recent");
    if (!res.ok) return;
    const data = await res.json();
    setRecentList(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAuthLoading(true);
    fetch("/api/auth/session")
      .then((res) => {
        if (cancelled) return;
        if (res.ok) return res.json();
        setUser(null);
        setSavedList(getSavedRecipes());
        setRecentList(getRecentRecipes());
      })
      .then((data) => {
        if (cancelled || !data?.user) return;
        setUser(data.user);
        return Promise.all([fetch("/api/saved"), fetch("/api/recent")]);
      })
      .then((responses) => {
        if (cancelled || !responses?.length) return;
        return Promise.all(responses.map((r) => r.json()));
      })
      .then((result) => {
        if (cancelled || !result || result.length !== 2) return;
        const [saved, recent] = result;
        setSavedList(Array.isArray(saved) ? saved : []);
        setRecentList(Array.isArray(recent) ? recent : []);
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setSavedList(getSavedRecipes());
          setRecentList(getRecentRecipes());
        }
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => { cancelled = true; };
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
          ingredientSections: recipe.ingredientSections,
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
            ingredientSections: data.recipe.ingredientSections ?? recipe.ingredientSections,
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
    if (user) {
      fetchSavedFromServer();
    } else {
      setSavedList(getSavedRecipes());
    }
  }

  function refreshRecentList() {
    if (user) {
      fetchRecentFromServer();
    } else {
      setRecentList(getRecentRecipes());
    }
  }

  async function addToRecentMaybe(recipe: Recipe) {
    if (user) {
      try {
        const res = await fetch("/api/recent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipe }),
        });
        if (res.ok) fetchRecentFromServer();
      } catch {
        // ignore
      }
    } else {
      addToRecent(recipe);
      setRecentList(getRecentRecipes());
    }
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
      if (!res.ok) {
        const errorCode = data.errorCode ?? (data.error === "PAYWALLED" ? "PAYWALLED" : null);
        const msg =
          errorCode === "PAYWALLED"
            ? t("urlPaywalled")
            : errorCode === "NO_RECIPE_DATA"
              ? t("urlNoRecipeData")
              : errorCode === "IMPORT_FAILED"
                ? t("urlImportFailed")
                : (data.error ?? "Failed to load recipe");
        throw new Error(msg);
      }
      setRecipe(data);
      addToRecentMaybe(data);
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
    setPhotoProgress(0);
    setPhotoStep(0);
    photoProgressRef.current = {
      progress: setInterval(() => {
        setPhotoProgress((p) => Math.min(p + 2, 90));
      }, 500),
      step: setInterval(() => {
        setPhotoStep((s) => (s + 1) % 3);
      }, 5000),
    };
    try {
      let blob: Blob = file;
      if (file.type.startsWith("image/") && typeof createImageBitmap === "function") {
        try {
          const bitmap = await createImageBitmap(file);
          const max = 1024;
          let { width, height } = bitmap;
          if (width > max || height > max) {
            if (width > height) {
              height = Math.round((height * max) / width);
              width = max;
            } else {
              width = Math.round((width * max) / height);
              height = max;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(bitmap, 0, 0, width, height);
            blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
                "image/jpeg",
                0.85
              );
            });
          }
          bitmap.close();
        } catch {
          // keep original file if resize fails
        }
      }

      const form = new FormData();
      form.append("image", blob, file.name);
      const res = await fetch("/api/recipe/photo", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to read recipe from photo");
      setRecipe(data);
      addToRecentMaybe(data);
      setCurrentSaved(null);
      setView("recipe");
      setMode("choose");
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        setError("Photo took too long to process. Try again or use a smaller image.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      if (photoProgressRef.current) {
        clearInterval(photoProgressRef.current.progress);
        clearInterval(photoProgressRef.current.step);
        photoProgressRef.current = null;
      }
      setPhotoProgress(100);
      setTimeout(() => {
        setLoading(false);
        setPhotoProgress(0);
      }, 400);
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
    if (user) {
      fetch("/api/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe, isPermanent }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.id) {
            setCurrentSaved({ ...recipe, id: data.id, savedAt: data.savedAt, isPermanent: data.isPermanent });
            fetchSavedFromServer();
          }
        })
        .catch(() => {});
      setSaveMenuOpen(false);
      return;
    }
    const saved = saveRecipe(recipe, isPermanent);
    setCurrentSaved(saved);
    setSaveMenuOpen(false);
    refreshSavedList();
  }

  function openSavedRecipe(item: SavedRecipe) {
    setRecipe(item);
    setCurrentSaved(item);
    addToRecentMaybe(item);
    setView("recipe");
  }

  function goToRecentList() {
    setView("recent-list");
    setRecipe(null);
    setCurrentSaved(null);
    refreshRecentList();
  }

  function openRecentRecipe(entry: RecentEntry) {
    setRecipe(entry.recipe);
    setCurrentSaved(null);
    addToRecentMaybe(entry.recipe);
    setView("recipe");
  }

  function handleRemoveFromSaved() {
    if (!currentSaved) return;
    if (user) {
      fetch(`/api/saved?id=${encodeURIComponent(currentSaved.id)}`, { method: "DELETE" })
        .then(() => {
          setRecipe(null);
          setCurrentSaved(null);
          setView("home");
          fetchSavedFromServer();
        });
      return;
    }
    deleteSavedRecipe(currentSaved.id);
    setRecipe(null);
    setCurrentSaved(null);
    setView("home");
    refreshSavedList();
  }

  function handleKeepPermanent() {
    if (!currentSaved) return;
    if (user) {
      fetch("/api/saved", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentSaved.id, isPermanent: true }),
      })
        .then(() => {
          setCurrentSaved({ ...currentSaved, isPermanent: true });
          fetchSavedFromServer();
        });
      return;
    }
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
    <div className="min-h-screen bg-[#f8f6f3] text-[#1a1918]">
      <header className="sticky top-0 z-30 border-b border-stone-200/50 bg-[#f8f6f3]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-5 py-4 sm:px-8">
          <h1 className="text-lg font-medium tracking-tight text-[#1a1918]">
            {t("appTitle")}
          </h1>
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangOpen((o) => !o)}
                className="rounded-md px-2 py-1.5 text-sm text-stone-500 hover:bg-stone-200/60 hover:text-[#1a1918]"
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
                  <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-stone-200 bg-white py-1 shadow-sm">
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
                            ? "bg-stone-100 font-medium text-[#1a1918]"
                            : "text-stone-500 hover:bg-stone-50"
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
                  ? "bg-stone-200/70 text-[#1a1918]"
                  : "text-stone-500 hover:bg-stone-200/50 hover:text-[#1a1918]"
              }`}
            >
              {t("savedRecipes")}{savedList.length > 0 ? ` (${savedList.length})` : ""}
            </button>
            <button
              type="button"
              onClick={() => (view === "recent-list" ? setView("home") : goToRecentList())}
              className={`rounded-md px-3 py-1.5 text-sm ${
                view === "recent-list"
                  ? "bg-stone-200/70 text-[#1a1918]"
                  : "text-stone-500 hover:bg-stone-200/50 hover:text-[#1a1918]"
              }`}
            >
              {t("recentlyBrowsed")}{recentList.length > 0 ? ` (${recentList.length})` : ""}
            </button>
            {!authLoading && (
              user ? (
                <div className="flex items-center gap-2">
                  {user.email && (
                    <span className="max-w-[140px] truncate text-sm text-stone-500" title={user.email}>
                      {user.email}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      fetch("/api/auth/sign-out", { method: "POST" }).then(() => {
                        setUser(null);
                        setSavedList(getSavedRecipes());
                        setRecentList(getRecentRecipes());
                      });
                    }}
                    className="rounded-md px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-200/50 hover:text-[#1a1918]"
                  >
                    {t("signOut")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setAuthModalOpen(true); setAuthError(null); setAuthTab("signin"); setAuthEmail(""); setAuthPassword(""); }}
                  className="rounded-md px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-200/50 hover:text-[#1a1918]"
                >
                  {t("signIn")}
                </button>
              )
            )}
            {showingRecipe && (
              <button
                type="button"
                onClick={clearRecipe}
                className="rounded-md px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-200/50 hover:text-[#1a1918]"
              >
                {t("newRecipe")}
              </button>
            )}
          </div>
        </div>
      </header>

      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" aria-hidden onClick={() => setAuthModalOpen(false)} />
          <div className="relative w-full max-w-sm rounded-lg border border-stone-200 bg-white p-6 shadow-lg">
            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => { setAuthTab("signin"); setAuthError(null); }}
                className={`rounded px-3 py-1.5 text-sm font-medium ${authTab === "signin" ? "bg-stone-200 text-[#1a1918]" : "text-stone-500 hover:bg-stone-100"}`}
              >
                {t("signInTitle")}
              </button>
              <button
                type="button"
                onClick={() => { setAuthTab("signup"); setAuthError(null); }}
                className={`rounded px-3 py-1.5 text-sm font-medium ${authTab === "signup" ? "bg-stone-200 text-[#1a1918]" : "text-stone-500 hover:bg-stone-100"}`}
              >
                {t("signUpTitle")}
              </button>
            </div>
            <p className="mb-4 text-sm text-stone-500">{t("logInToSync")}</p>
            {authError && (
              <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{authError}</p>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setAuthError(null);
                const url = authTab === "signin" ? "/api/auth/sign-in" : "/api/auth/sign-up";
                const res = await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  const msg = data.error === "Auth not configured" ? t("authNotConfigured") : (data.error ?? t("authError"));
                  setAuthError(msg);
                  return;
                }
                setAuthModalOpen(false);
                setUser(data.user ?? { id: "", email: authEmail.trim() });
                fetchSavedFromServer();
                fetchRecentFromServer();
              }}
              className="space-y-4"
            >
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-[#1a1918]">{t("email")}</span>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full rounded border border-stone-200 px-3 py-2 text-[#1a1918]"
                  required
                  autoComplete="email"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-[#1a1918]">{t("password")}</span>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full rounded border border-stone-200 px-3 py-2 text-[#1a1918]"
                  required
                  minLength={6}
                  autoComplete={authTab === "signin" ? "current-password" : "new-password"}
                />
              </label>
              <button
                type="submit"
                className="w-full rounded bg-[#1a1918] px-4 py-2 text-sm font-medium text-[#f8f6f3] hover:opacity-90"
              >
                {authTab === "signin" ? t("signInTitle") : t("signUpTitle")}
              </button>
            </form>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
        {view === "saved-list" && (
          <SavedList
            list={savedList}
            onOpen={openSavedRecipe}
            onDelete={(id) => {
              if (user) {
                fetch(`/api/saved?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(() => fetchSavedFromServer());
              } else {
                deleteSavedRecipe(id);
                refreshSavedList();
              }
            }}
            onBack={() => setView("home")}
            t={t}
            daysUntilExpiry={daysUntilExpiry}
          />
        )}

        {view === "recent-list" && (
          <RecentList
            list={recentList}
            onOpen={openRecentRecipe}
            onRemove={(id) => {
              if (user) {
                fetch(`/api/recent?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(() => fetchRecentFromServer());
              } else {
                removeFromRecent(id);
                refreshRecentList();
              }
            }}
            onBack={() => setView("home")}
            t={t}
          />
        )}

        {showingRecipe && (
          <>
            {translationLoading && (
              <p className="mb-3 text-sm text-stone-500">
                {t("translating")}
              </p>
            )}
            <RecipeView
              recipe={translatedRecipe ?? recipe!}
              onRecipeChange={(newRecipe) => {
                setRecipe(newRecipe);
                setTranslatedRecipe(null);
              }}
            />
            <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-stone-200/60 pt-6">
              {isSaved ? (
                <>
                  <span className="text-sm text-stone-500">
                    {currentSaved.isPermanent
                      ? t("savedPermanently")
                      : t("expiresInDays", { days: daysUntilExpiry(currentSaved)! })}
                  </span>
                  {!currentSaved.isPermanent && (
                    <button
                      type="button"
                      onClick={handleKeepPermanent}
                      className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-[#1a1918] hover:bg-stone-50"
                    >
                      {t("keepPermanently")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRemoveFromSaved}
                    className="text-sm text-stone-500 underline hover:text-[#1a1918]"
                  >
                    {t("removeFromSaved")}
                  </button>
                </>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setSaveMenuOpen((o) => !o)}
                    className="rounded-md border border-[#1a1918]/80 bg-[#1a1918] px-4 py-2 text-sm font-medium text-[#f8f6f3] hover:opacity-90"
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
                      <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-stone-200 bg-white py-1 shadow-sm">
                        <button
                          type="button"
                          onClick={() => handleSaveRecipe(false)}
                          className="block w-full px-4 py-2 text-left text-sm text-[#1a1918] hover:bg-stone-50"
                        >
                          {t("saveFor30Days")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveRecipe(true)}
                          className="block w-full px-4 py-2 text-left text-sm text-[#1a1918] hover:bg-stone-50"
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
              <>
                <section className="mb-10">
                  <p className="text-lg font-semibold tracking-tight text-[#1a1918] sm:text-xl">
                    {t("introTagline")}
                  </p>
                  <p className="mt-3 text-sm text-stone-500 leading-relaxed sm:text-base">
                    {t("introBody")}
                  </p>
                  <ul className="mt-5 space-y-2 text-sm text-stone-600">
                    <li className="flex items-center gap-2">
                      <span className="text-stone-400" aria-hidden>•</span>
                      {t("introBullet1")}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-stone-400" aria-hidden>•</span>
                      {t("introBullet2")}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-stone-400" aria-hidden>•</span>
                      {t("introBullet3")}
                    </li>
                  </ul>
                </section>
                <div className="grid gap-5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setMode("url")}
                    className="flex flex-col items-center gap-4 rounded-[0.5rem] border border-stone-200 bg-white p-8 text-left transition hover:border-stone-300/80"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-500">
                      <LinkIcon />
                    </span>
                    <span className="font-medium text-[#1a1918]">
                      {t("importFromUrl")}
                    </span>
                    <span className="text-center text-sm text-stone-500 leading-relaxed">
                      {t("importFromUrlDesc")}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("photo")}
                    className="flex flex-col items-center gap-4 rounded-[0.5rem] border border-stone-200 bg-white p-8 text-left transition hover:border-stone-300/80"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-500">
                      <CameraIcon />
                    </span>
                    <span className="font-medium text-[#1a1918]">
                      {t("importFromPhoto")}
                    </span>
                    <span className="text-center text-sm text-stone-500 leading-relaxed">
                      {t("importFromPhotoDesc")}
                    </span>
                  </button>
                </div>
              </>
            )}

            {mode === "url" && (
              <div className="max-w-xl">
                <button
                  type="button"
                  onClick={() => setMode("choose")}
                  className="mb-5 text-sm text-stone-500 hover:text-[#1a1918]"
                >
                  ← {t("back")}
                </button>
                <form onSubmit={handleSubmitUrl} className="space-y-5">
                  <label className="block text-sm font-medium text-[#1a1918]">
                    {t("recipeUrl")}
                  </label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://www.seriouseats.com/..."
                    className="w-full rounded-md border border-stone-200 bg-white px-4 py-3 text-[#1a1918] placeholder:text-stone-500 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400/50"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-md bg-[#1a1918] px-4 py-3 font-medium text-[#f8f6f3] hover:opacity-90 disabled:opacity-50"
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
                  className="mb-5 text-sm text-stone-500 hover:text-[#1a1918]"
                >
                  ← {t("back")}
                </button>
                <label className="flex cursor-pointer flex-col items-center gap-5 rounded-[0.5rem] border-2 border-dashed border-stone-200 bg-white p-10 transition hover:border-stone-300/80 hover:bg-stone-50/30">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-100 text-stone-500">
                    <CameraIcon />
                  </span>
                  <span className="font-medium text-[#1a1918]">
                    {t("choosePhotoDesc")}
                  </span>
                  <span className="text-center text-sm text-stone-500 leading-relaxed">
                    {t("photoFormatHint")}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    disabled={loading}
                    className="hidden"
                  />
                </label>
                {loading && (
                  <div className="mt-5 space-y-3">
                    <p className="text-center text-sm font-medium text-[#1a1918]">
                      {photoStep === 0
                        ? t("photoStepUploading")
                        : photoStep === 1
                          ? t("photoStepReading")
                          : t("photoStepExtracting")}
                    </p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
                      <div
                        className="h-full rounded-full bg-[#1a1918] transition-[width] duration-300 ease-out"
                        style={{ width: `${photoProgress}%` }}
                      />
                    </div>
                    <p className="text-center text-xs text-stone-500">
                      {Math.round(photoProgress)}%
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function RecentList({
  list,
  onOpen,
  onRemove,
  onBack,
  t,
}: {
  list: RecentEntry[];
  onOpen: (entry: RecentEntry) => void;
  onRemove: (id: string) => void;
  onBack: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-5 text-sm text-stone-500 hover:text-[#1a1918]"
      >
        ← {t("back")}
      </button>
      <h2 className="mb-6 text-xl font-medium tracking-tight text-[#1a1918]">
        {t("recentListTitle")}
      </h2>
      {list.length === 0 ? (
        <p className="rounded-[0.5rem] border border-stone-200 bg-white p-8 text-center text-stone-500 leading-relaxed">
          {t("noRecentRecipes")}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-[0.5rem] border border-stone-200 bg-white px-4 py-3"
            >
              <button
                type="button"
                onClick={() => onOpen(entry)}
                className="min-w-0 flex-1 text-left font-medium text-[#1a1918] hover:text-stone-600"
              >
                {entry.recipe.name}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(entry.id);
                }}
                className="shrink-0 rounded p-1.5 text-stone-500 hover:bg-stone-100 hover:text-red-700/90"
                aria-label={t("removeFromRecentAria")}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
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
        className="mb-5 text-sm text-stone-500 hover:text-[#1a1918]"
      >
        ← {t("back")}
      </button>
      <h2 className="mb-6 text-xl font-medium tracking-tight text-[#1a1918]">
        {t("savedListTitle")}
      </h2>
      {list.length === 0 ? (
        <p className="rounded-[0.5rem] border border-stone-200 bg-white p-8 text-center text-stone-500 leading-relaxed">
          {t("noSavedRecipes")}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((item) => {
            const days = daysUntilExpiry(item);
            return (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-[0.5rem] border border-stone-200 bg-white px-4 py-3"
              >
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className="min-w-0 flex-1 text-left font-medium text-[#1a1918] hover:text-stone-600"
                >
                  {item.name}
                </button>
                <span className="shrink-0 text-sm text-stone-500">
                  {item.isPermanent ? t("permanent") : t("expiresInDays", { days: days ?? 0 })}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  className="shrink-0 rounded p-1.5 text-stone-500 hover:bg-stone-100 hover:text-red-700/90"
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
