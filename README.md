# Pensieve (smart-notes)

Evernote-style rich-text notes with a one-click **정리하기** button (Claude via the Anthropic API), plus read-only public sharing of single notes and whole notebooks.

- **Web**: Vite + React + TipTap (rich text: headings, bold/italic/underline/strike, highlight, lists, checklists, quotes, code blocks, links, alignment)
- **Backend (Firebase, Google)**: Auth (Google sign-in), Firestore, Cloud Functions v2 (`organize`), Hosting
- **AI**: `claude-opus-5-5` called only from the server; the API key lives in Secret Manager

## Why Firebase

| | Firebase (Google) | AWS | Azure |
|---|---|---|---|
| DB free tier | Firestore 1 GiB, 50K reads/20K writes per day (always free) | DynamoDB 25 GB (always free) | Cosmos DB 1000 RU/s, 25 GB |
| Auth | Free (Google login built in) | Cognito 10K MAU free | Entra External ID 50K MAU |
| Server function | 2M invocations/month free | Lambda 1M/month free | Functions 1M/month free |
| Hosting | 10 GB storage, 360 MB/day transfer | Amplify (12-month free tier) | Static Web Apps free plan |
| Setup effort | **Lowest**: one SDK, security rules, live sync | Several services (Cognito + API GW + Lambda + DynamoDB) | Medium |

> Cloud Functions needs the **Blaze (pay-as-you-go)** plan linked to a billing account. Usage inside the free quota costs nothing. Anthropic API usage is billed separately by Anthropic.

## Data model

```
users/{uid}/notebooks/{id}      { name, isPublic, createdAt }                 # private
users/{uid}/notes/{id}          { notebookId, title, contentHtml, tags, isPublic, ... }

publicNotes/{uid}_{noteId}                      # mirror of a note shared on its own (get only, not listable)
publicNotebooks/{uid}_{notebookId}              # mirror of a shared notebook + its note list (get only)
publicNotebooks/{uid}_{notebookId}/notes/{noteId}  # its notes, one get each
```

Clients only write their private docs; sharing is just the `isPublic` flag. The public mirror is
maintained by Firestore-triggered Cloud Functions (`functions/src/mirrorTriggers.ts`, with
`sharePlan.ts` deciding what to write or delete), and the security rules deny every client write to
`publicNotes` / `publicNotebooks`, so a link can't be spoofed, taken over or left behind. Each trigger
re-reads the current private docs, so retries and out-of-order events converge on the right mirror.
A shared notebook doc carries its note list (title, excerpt, date; newest 1000), so the public page
needs one read, not a collection query. Public pages sanitize HTML with DOMPurify before rendering.

The mirror updates a moment after a save (one trigger run), not in the same write.

Share URLs:
- `/share/note/{uid}_{noteId}`
- `/share/notebook/{uid}_{notebookId}` lists the notebook's notes; `/share/notebook/{uid}_{notebookId}/{noteId}` opens one note

## Local development (emulators)

```bash
cd functions && npm install && npm run build && cd ..
cd web && npm install && cp .env.example .env.local   # set VITE_USE_EMULATOR=true and VITE_FIREBASE_PROJECT_ID=demo-smart-notes
cd ..
echo "ANTHROPIC_API_KEY=sk-ant-..." > functions/.secret.local    # gitignored
firebase emulators:start --project demo-smart-notes --only auth,firestore,functions
# other terminal
cd web && npm run dev    # http://localhost:5173
```

Emulator ports are 9299 (auth), 8181 (firestore), 5101 (functions) and 4100 (UI). They differ from the defaults so they don't clash with other projects.

## Deploy

1. Create a Firebase project, enable **Authentication → Google**, create a **Firestore** database in
   **asia-northeast3 (Seoul)**, and switch the project to the **Blaze** plan. The mirror triggers are pinned
   to that region (`REGION` in `functions/src/mirrorTriggers.ts`); Firestore triggers must run in the
   database's region, so change both together if you pick another location.
2. `cp .firebaserc.example .firebaserc` and set your project ID.
3. Set the Anthropic key as a secret: `firebase functions:secrets:set ANTHROPIC_API_KEY`
4. Fill in `web/.env.local` with the web app config (`VITE_USE_EMULATOR=false`).
5. Build and deploy:
   ```bash
   (cd web && npm run build)
   firebase deploy --only firestore:rules,functions,hosting
   ```
6. Add your hosting domain under Authentication → Settings → Authorized domains if you use a custom domain.

## Google Drive backup (optional)

Signed-in users can turn on a one-way backup of every note to their own Google Drive:
`My Drive/Pensieve/<notebook>/<note title>.md` (Markdown with YAML front matter; mind maps become nested lists).
Firestore stays the source of truth. Only changed notes are uploaded, a few seconds after edits settle;
deleted notes go to the Drive trash. The app uses the `drive.file` scope, so it can only see files it created.

Setup (Google Cloud console of the same project):
1. **APIs & Services → Library**: enable **Google Drive API**.
2. **OAuth consent screen**: add the scope `.../auth/drive.file` (non-sensitive, no verification review needed).
   While the app is in *Testing*, add your account as a test user, or publish it.
3. **Credentials**: open the OAuth *Web client* (Firebase auto-creates one for Google sign-in) and add your
   origins (e.g. `https://<project>.web.app`, `http://localhost:5173`) under **Authorized JavaScript origins**.
4. Put its client ID in `web/.env.local` as `VITE_GOOGLE_CLIENT_ID`. Without it the backup button is hidden.

The Drive token comes from Google Identity Services and lasts about an hour; after that (or after a reload)
the top bar shows **Drive 다시 연결**, one click to resume.

## Tests

```bash
(cd functions && npm test)   # organizer parsing, share plan, mirror/index helpers
(cd web && npm test)         # router, mind-map layout, Drive backup plan/markdown
(cd functions && npm run test:emulator)   # rules + mirror triggers end to end (starts its own emulators;
                                          # stop a running `emulators:start` first, ports are shared)
```

## Customizing the AI organizer

Edit `ORGANIZE_RULES` in `functions/src/prompt.ts`. That list is the organizer's whole editing style.
