/* ═══════════════════════════════════════════════════════
   HUTCHDASH — Firebase Configuration
   ───────────────────────────────────────────────────────
   HOW TO FILL THIS IN:
   1. Go to https://console.firebase.google.com
   2. Create a new project (e.g. "hutchdash")
   3. Click the </> (Web) button to add a web app
   4. Copy the firebaseConfig object values below
   5. In Firebase console → Authentication → Sign-in method
      → Enable "Google"
   6. In Firebase console → Firestore Database → Create
      → Start in production mode → choose a region
   7. In Firestore → Rules → paste the rules from SETUP.md
   8. It's safe to commit this file to GitHub — Firebase
      client keys are restricted by Firestore security rules
═══════════════════════════════════════════════════════ */

const FIREBASE_CONFIG = {
  apiKey:            "REPLACE_WITH_YOUR_API_KEY",
  authDomain:        "REPLACE_WITH_YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId:             "REPLACE_WITH_YOUR_APP_ID"
};
