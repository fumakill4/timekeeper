# TimeKeeper

TimeKeeper is a React/Vite attendance workspace with an optional WhatsApp Bot integration. This repository contains reusable source code, rules, tests, and the Excel export template. It does not contain a production Firebase project, user records, WhatsApp session, or private credentials.

## Structure

- `WebApp/` — React/Vite frontend.
- `WhatsApp Bot/` — optional Baileys bot, Cloud Run files, parser, and tests.
- `Documentation/` — reusable application specifications and setup notes.
- `Reference/` — design references and the Excel template source.

## Local setup

1. Install Node.js 20 or newer.
2. From this folder, install frontend dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local` and fill it with the Firebase Web App configuration for your own project.
4. Start the frontend:

   ```bash
   npm run dev
   ```

5. Build for production:

   ```bash
   npm run build
   ```

Never commit `.env.local`, service-account JSON files, WhatsApp sessions, or exported operational data. The included `.gitignore` is intentionally configured to exclude them.

## Firebase and deployment

Create your own Firebase project and configure Authentication, Firestore, Storage, and Hosting. Use your own project ID and hosting target; the production project used by the original author is not part of this public repository.

```bash
npx firebase login
npx firebase use --add
npm run firebase:deploy
```

The WhatsApp Bot has its own `.env.example` and README. Its sender allow-list, Firebase project, Cloud Storage bucket, origin, and WhatsApp session must be configured by each deployment owner.

## Attribution

This project keeps the original developer signature in the source:

```js
// This App was build by Chris Tambayong - Fumakill4
```

Please retain that attribution when redistributing or adapting the project.
