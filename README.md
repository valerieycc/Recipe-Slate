This is a [Next.js](https://nextjs.org) project: **Recipe Slate** — import recipes from URLs or cookbook photos.

## Recipe Slate

- **Import from URL** — Paste a recipe link; the app scrapes structured data (JSON-LD / schema.org) and shows ingredients and steps.
- **Import from photo** — Upload a photo of a cookbook page; an OpenAI vision model reads the image and returns a structured recipe (title, ingredients, steps). Requires `OPENAI_API_KEY`. **Limit:** 5 free photo imports per month per user (or per device when not logged in); users can add their own OpenAI key in Settings or subscribe for more.
- **Recipe view** — Tabbed layout (Ingredients | Steps), optional image, prep/cook time and servings. Works on desktop and mobile.
- **Saved recipes** — Save for 30 days or permanently. When you **log in**, data is stored on the server and syncs across devices; when signed out, data stays in the browser (localStorage).
- **Recently browsed** — Automatic history of viewed recipes; same server/local behavior as saved when logged in.

## Supabase setup (for login & server-side storage)

1. Create a project at [Supabase](https://supabase.com).
2. In the SQL Editor, run the contents of `supabase/migrations/001_saved_and_recent.sql` to create `saved_recipes` and `recent_recipes` tables and RLS policies. For the 5 photo imports/month limit, also run `supabase/migrations/002_photo_import_usage.sql` and set `SUPABASE_SERVICE_ROLE_KEY` in env.
3. Copy `.env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL from Supabase dashboard
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon/public key from API settings
   - (Optional) `SUPABASE_SERVICE_ROLE_KEY` — service role key from API settings; required for the **5 photo imports per month** limit. Run `supabase/migrations/002_photo_import_usage.sql` in the SQL Editor first.
4. In Supabase **Authentication → Providers**, enable **Email** so users can sign up and log in with email and password. (Turn off **Anonymous sign-ins** if you no longer need it.)

### Photo import (OpenAI Vision)

Photo import uses OpenAI’s vision model to read the image and extract the recipe. Set in `.env.local`:

- `OPENAI_API_KEY` — Your [OpenAI API key](https://platform.openai.com/api-keys). The app uses `gpt-4o-mini` with vision to extract title, ingredients, and steps from a photo. If unset, photo import returns an error.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
