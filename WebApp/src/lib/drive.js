import { GoogleAuthProvider, reauthenticateWithPopup } from "firebase/auth";
import { auth } from "./firebase";

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
let cachedToken = null;
let cachedTokenExpiresAt = 0;

export async function getGoogleDriveAccessToken() {
  if (cachedToken && cachedTokenExpiresAt > Date.now() + 60_000) return cachedToken;
  if (!auth?.currentUser) throw new Error("Sesi login Google belum tersedia.");

  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_FILE_SCOPE);
  provider.setCustomParameters({ prompt: "consent" });
  const result = await reauthenticateWithPopup(auth.currentUser, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) throw new Error("Izin Google Drive belum diberikan.");

  cachedToken = credential.accessToken;
  cachedTokenExpiresAt = Date.now() + 50 * 60_000;
  return cachedToken;
}

export function hasGoogleDriveConnection() {
  return Boolean(cachedToken && cachedTokenExpiresAt > Date.now() + 60_000);
}

export function uploadWorkbookToGoogleDrive(blob, filename, accessToken, onProgress = () => {}) {
  const boundary = `timekeeper-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: filename, mimeType: XLSX_MIME });
  const multipart = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${XLSX_MIME}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ], { type: `multipart/related; boundary=${boundary}` });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink");
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("Content-Type", `multipart/related; boundary=${boundary}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onerror = () => reject(new Error("Koneksi upload Google Drive terputus."));
    xhr.onload = () => {
      const payload = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 200 && xhr.status < 300) return resolve(payload);
      reject(new Error(payload.error?.message || `Google Drive menolak upload (${xhr.status}).`));
    };
    xhr.send(multipart);
  });
}
