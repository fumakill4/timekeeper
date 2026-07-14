const admin = require("firebase-admin");

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  admin.initializeApp({
    ...(projectId ? { projectId } : {}),
    storageBucket: process.env.TIMEKEEPER_WA_SESSION_BUCKET || undefined,
  });
}

module.exports = {
  admin,
  db: admin.firestore(),
};
