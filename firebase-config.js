// ============================================================
// firebase-config.js — StudySentry Firebase Configuration
// ⚠️  Replace ALL placeholder values with your actual Firebase
//     project settings from the Firebase Console.
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyANqiZJg82BYTmNhhhu0nXH0u9tJ14dNXI",
  authDomain: "studysentry.firebaseapp.com",
  projectId: "studysentry",
  storageBucket: "studysentry.firebasestorage.app",
  messagingSenderId: "589955348928",
  appId: "1:589955348928:web:d3efd4ce3b44095a71b025"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// ── Service references (used throughout app.js) ──────────────
const auth     = firebase.auth();
const db       = firebase.firestore();
const storage  = firebase.storage();

// ── Enable Firestore offline persistence ─────────────────────
db.enablePersistence({ synchronizeTabs: true })
  .then(() => console.log("✅ Firestore offline persistence enabled"))
  .catch(err => {
    if (err.code === "failed-precondition") {
      console.warn("Offline persistence: multiple tabs open.");
    } else if (err.code === "unimplemented") {
      console.warn("Offline persistence: not supported in this browser.");
    }
  });
