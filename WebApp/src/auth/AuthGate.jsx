import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { ArrowRight, Check, CircleAlert, ExternalLink, ShieldCheck } from "lucide-react";
import { auth, db, isFirebaseConfigured } from "../lib/firebase";
import { APP_VERSION } from "../version";

const AuthContext = createContext(null);

export function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const loginWithGoogle = async () => {
    if (!auth || !db) return;
    setError("");
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      await setDoc(doc(db, "users", result.user.uid), {
        uid: result.user.uid,
        displayName: result.user.displayName || "",
        email: result.user.email || "",
        photoURL: result.user.photoURL || "",
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setUser(result.user);
    } catch (loginError) {
      console.error("[TimeKeeper Auth]", loginError);
      setError(getAuthErrorMessage(loginError));
      setLoading(false);
    }
  };

  const logout = async () => {
    if (auth) await signOut(auth);
  };

  const value = useMemo(() => ({ user, logout }), [user]);

  if (!isFirebaseConfigured) return <FirebaseSetupScreen />;
  if (loading) return <AuthLoading />;
  if (!user) return <LoginScreen onLogin={loginWithGoogle} error={error} />;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthGate");
  return context;
}

function AuthLoading() {
  return <div className="auth-shell"><div className="auth-loading"><span className="auth-spinner" /><p>Memeriksa sesi TimeKeeper...</p></div></div>;
}

function FirebaseSetupScreen() {
  return <div className="auth-shell"><div className="setup-card"><div className="auth-brand"><span className="auth-mark">✓</span><span>Time<span>Keeper</span></span></div><div className="auth-eyebrow">FIREBASE SETUP</div><h1>Hubungkan project Firebase dulu.</h1><p className="auth-copy">Login Gmail sudah siap di kode. Tambahkan konfigurasi Web App dari Firebase Console ke file <code>.env.local</code>, lalu restart server.</p><div className="setup-list"><SetupItem text="Authentication dengan provider Google" /><SetupItem text="Cloud Firestore untuk profil user" /><SetupItem text="Firebase Hosting untuk deploy" /></div><div className="setup-command"><span>File yang perlu dibuat</span><code>.env.local</code></div><a className="auth-doc-link" href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">Buka Firebase Console <ExternalLink size={14} /></a><small className="auth-version">{APP_VERSION}</small></div></div>;
}

function LoginScreen({ onLogin, error }) {
  return <div className="auth-shell"><div className="login-card"><div className="auth-brand"><span className="auth-mark">✓</span><span>Time<span>Keeper</span></span></div><div className="auth-eyebrow">WORKSPACE ACCESS</div><h1>Selamat datang kembali.</h1><p className="auth-copy">Masuk dengan akun Google yang sudah terdaftar untuk mengelola absensi tim.</p>{error && <div className="auth-error"><CircleAlert size={15} />{error}</div>}<button className="google-button" onClick={onLogin}><span className="google-g">G</span> Masuk dengan Google <ArrowRight size={16} /></button><div className="auth-safe"><ShieldCheck size={15} /><span>Login diamankan oleh Firebase Authentication</span></div><small className="auth-version">{APP_VERSION}</small></div></div>;
}

function SetupItem({ text }) {
  return <div className="setup-item"><span><Check size={13} /></span>{text}</div>;
}

function getAuthErrorMessage(error) {
  if (error?.code === "auth/popup-closed-by-user") return "Jendela login ditutup sebelum selesai.";
  if (error?.code === "auth/unauthorized-domain") return "Domain ini belum ditambahkan ke Authorized domains Firebase. Tambahkan domain hosting Firebase milik project ini di Firebase Console.";
  if (error?.code === "auth/popup-blocked") return "Popup login diblokir browser. Izinkan popup lalu coba lagi.";
  if (error?.code === "auth/operation-not-allowed") return "Provider Google belum benar-benar aktif di Firebase Authentication.";
  if (error?.code === "auth/invalid-api-key") return "API key Firebase tidak valid. Periksa ulang konfigurasi Web App.";
  if (error?.code === "auth/api-key-not-valid.-please-pass-a-valid-api-key.") return "API key Firebase tidak valid. Periksa ulang konfigurasi Web App.";
  if (error?.code === "permission-denied") return "Login Google berhasil, tetapi penulisan profil ke Firestore ditolak oleh Firestore Rules.";
  return `Login Google gagal (${error?.code || "unknown-error"}). Periksa Firebase Console dan coba lagi.`;
}
