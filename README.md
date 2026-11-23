# Couple Compatibility

Two people create one link, answer questions separately, and see their answers together once both have finished. A conversation tool, not a diagnosis or a prediction of success.

## Status

- Done: questionnaire UI (100 items), create-link and join flow, waiting screen, Firestore rules for sessions and answers.
- Not yet: saving answers to the shared session, the reveal screen, psychology-based matching. The questionnaire currently saves to this device only.

## One-time Firebase setup

1. In the Firebase console, create a project and add a **Web app**. Copy its config into `public/js/config.js`.
2. **Authentication → Sign-in method → Anonymous → Enable.**
3. **Firestore Database → Create database** (production mode).
4. Set your project id in `.firebaserc`.

## Deploy

```bash
npm i -g firebase-tools
firebase login
firebase deploy --only firestore:rules,hosting
```

## Run locally

Use the emulators so no real data is touched:

```bash
firebase emulators:start --only firestore,hosting,auth
```

Then open the Hosting URL it prints. For the emulators to be used, point `firebase.js` at them with `connectFirestoreEmulator` and `connectAuthEmulator` (not wired yet).

## How the link works

- Person A enters a name and gets a link like `https://your-site/?join=ABCD2345`.
- Person B opens it, enters a name, and joins. The session moves to `both_joined`.
- Each person answers on their own device. Answers are never readable by the partner until the session is `revealed`, and that is enforced by `firestore.rules`, not by the UI.

## Before real use

The questions and matching rules are a draft. A psychologist or relationship expert should review them. The app must keep the disclaimer on screen.
