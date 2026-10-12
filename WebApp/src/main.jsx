import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlarmClock, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bell, Bot, BriefcaseBusiness, CalendarDays, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Cloud, Edit3, Filter, Gauge, History, Info, Landmark, LayoutDashboard, LoaderCircle, LogOut, MapPin, Menu, MessageCircle, Moon, MoreHorizontal, Pencil, Phone, Plus, QrCode, RefreshCw, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Sun, Trash2, Upload, UserRound, Users, WalletCards, Wifi, X } from "lucide-react";
import { ATTENDANCE_CONFIG, SHIFTS, formatRupiah, formatWorkedMinutes } from "./lib/attendance";
import "./styles.css";
import { AuthGate, useAuth } from "./auth/AuthGate";
import { APP_VERSION } from "./version";
import { isWaBotConfigured, waBotApi } from "./lib/waBot";
import { getGoogleDriveAccessToken, hasGoogleDriveConnection, uploadWorkbookToGoogleDrive } from "./lib/drive";
import { getBrowserTimeZone, getTodayIsoDate, useLiveTimekeeperData } from "./lib/liveData";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "./lib/firebase";
// This App was build by i729 - Fumakill4

const regionOrder = ["Selatan", "Utara", "Barat"];

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "employees", label: "Data Karyawan", icon: Users },
  { id: "outlets", label: "Outlet", icon: Landmark },
  { id: "settings", label: "Pengaturan", icon: Settings },
  { id: "about", label: "About", icon: Info },
];

function Logo({ compact = false, full = false }) {
  if (full) return <div className="brand brand-full"><img className="brand-full-logo" src="/timekeeper-logo-blended-v2.png" alt="TimeKeeper — Every Hour Counts." /></div>;
  return <div className={`brand ${compact ? "brand-compact" : ""}`}><span className="brand-mark brand-image"><img src="/timekeeper-logo-transparent.png" alt="TimeKeeper" /></span>{!compact && <span className="brand-name">Time<span>Keeper</span><small>Every Hour Counts.</small></span>}</div>;
}

function App() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState(() => (typeof window !== "undefined" && window.localStorage.getItem("timekeeper-theme")) || "light");
  const [profile, setProfile] = useState({ name: user?.displayName || "", email: user?.email || "", phone: "", photoURL: user?.photoURL || "" });
  const userName = profile.name || user?.displayName || user?.email?.split("@")[0] || "Admin";
  const userInitials = userName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const { employees: liveEmployees, outlets: liveOutlets, records: liveRecords, loading: dataLoading, error: dataError } = useLiveTimekeeperData(user?.uid);
  const [active, setActive] = useState("dashboard");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [selectedOutletId, setSelectedOutletId] = useState(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [showOutletEdit, setShowOutletEdit] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showEmployeeCreate, setShowEmployeeCreate] = useState(false);
  const [showOutletCreate, setShowOutletCreate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(false);
  const [settings, setSettings] = useState({ tolerance: 0, overtimeRate: ATTENDANCE_CONFIG.overtimeRatePerHour, normalWorkHours: ATTENDANCE_CONFIG.normalWorkHours, shifts: SHIFTS, botActive: true });
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [driveConnected, setDriveConnected] = useState(hasGoogleDriveConnection());
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("timekeeper-theme", theme);
  }, [theme]);
  const displayTimeZone = getBrowserTimeZone();
  const displayTimeZoneLabel = formatTimeZoneLabel(displayTimeZone);
  const todayLabel = formatTodayLabel(new Date(), displayTimeZone);
  const today = getTodayIsoDate(new Date(), displayTimeZone);
  const records = liveRecords;
  const employees = liveEmployees;
  const outletDirectory = liveOutlets;
  const stores = liveOutlets;
  const shifts = Array.isArray(settings.shifts) && settings.shifts.length ? settings.shifts : SHIFTS;
  const shiftById = Object.fromEntries(shifts.map((shift) => [shift.id, shift]));
  const storeById = Object.fromEntries(stores.map((store) => [store.id, store]));

  useEffect(() => {
    if (!user || !db) return undefined;
    let active = true;
    getDoc(doc(db, "users", user.uid)).then((snapshot) => {
      if (!active) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      setProfile({ name: data.displayName || user.displayName || "", email: data.email || user.email || "", phone: data.whatsapp || data.phone || "", photoURL: data.photoURL || user.photoURL || "" });
    }).catch((error) => notify(`Profil belum bisa dimuat: ${error.message}`));
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user || !db) return undefined;
    let active = true;
    getDoc(doc(db, "timekeeperSettings", "global")).then((snapshot) => {
      if (!active || !snapshot.exists()) return;
      const data = snapshot.data();
      setSettings((current) => ({
        ...current,
        ...data,
        tolerance: Number.isFinite(Number(data.tolerance)) ? Math.max(0, Number(data.tolerance)) : current.tolerance,
        overtimeRate: Number.isFinite(Number(data.overtimeRate)) ? Math.max(0, Number(data.overtimeRate)) : current.overtimeRate,
        shifts: Array.isArray(data.shifts) && data.shifts.length ? data.shifts : current.shifts,
      }));
    }).catch((error) => notify(`Pengaturan belum bisa dimuat: ${error.message}`));
    return () => { active = false; };
  }, [user]);

  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId);
  const selectedOutlet = stores.find((store) => store.id === selectedOutletId);
  const currentRecords = records.filter((record) => record.workDate === today);
  const lateNotifications = employees.filter((employee) => employee.totalLate > 2).map((employee) => ({ id: employee.id, employee, title: `${employee.name} terdeteksi ${employee.totalLate}x terlambat`, detail: "Melewati batas perhatian keterlambatan." }));
  const notificationKey = lateNotifications.map((item) => `${item.id}:${item.employee.totalLate}`).join("|");
  const unreadNotifications = notificationsRead ? 0 : lateNotifications.length;

  useEffect(() => {
    setNotificationsRead(false);
  }, [notificationKey]);

  const openEmployee = (employeeId, tab = "overview") => { setSelectedEmployeeId(employeeId); setDetailTab(tab); setShowHistory(tab === "history"); setActive("employee-detail"); };
  const goTo = (page) => { setActive(page); setSelectedOutletId(null); setSelectedEmployeeId(null); setShowHistory(false); };
  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const updateSettings = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (!db) return { ok: false, message: "Firebase belum siap." };
    try {
      await setDoc(doc(db, "timekeeperSettings", "global"), {
        tolerance: Math.max(0, Number(next.tolerance) || 0),
        lateToleranceMinutes: Math.max(0, Number(next.tolerance) || 0) || ATTENDANCE_CONFIG.lateToleranceMinutes,
        overtimeRate: Math.max(0, Number(next.overtimeRate) || 0),
        normalWorkHours: ATTENDANCE_CONFIG.normalWorkHours,
        shifts: next.shifts,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      return { ok: true };
    } catch (error) {
      notify(`Pengaturan belum tersimpan: ${error.message}`);
      return { ok: false, message: error.message };
    }
  };
  const connectGoogleDrive = async () => {
    setBackupBusy(true);
    try {
      await getGoogleDriveAccessToken();
      setDriveConnected(true);
      notify("Google Drive berhasil tersambung. Tombol Backup sekarang tersedia.");
    } catch (error) {
      notify(`Koneksi Google Drive gagal: ${error.message}`);
    } finally {
      setBackupBusy(false);
    }
  };
  const backupToGoogleDrive = async () => {
    if (!driveConnected) return connectGoogleDrive();
    setBackupBusy(true);
    setBackupProgress(5);
    try {
      const accessToken = await getGoogleDriveAccessToken();
      setBackupProgress(15);
      const label = getAttendancePeriodLabel(today);
      const workbook = await waBotApi.exportPeriod(label);
      setBackupProgress(35);
      const filename = `${today.replace(/-/g, "")} - Rekapan Periode ${label}.xlsx`;
      const uploaded = await uploadWorkbookToGoogleDrive(workbook, filename, accessToken, (progress) => setBackupProgress(35 + Math.round(progress * 0.65)));
      setBackupProgress(100);
      notify(`Backup Excel berhasil disimpan ke Google Drive${uploaded?.name ? `: ${uploaded.name}` : ""}`);
    } catch (error) {
      notify(`Backup Google Drive gagal: ${error.message}`);
      setBackupProgress(0);
    } finally {
      setBackupBusy(false);
    }
  };
  const exportTemplate = () => {
    const link = document.createElement("a");
    link.href = "/TimeKeeper_Export_Rekap.xlsx";
    const periodLabel = getAttendancePeriodLabel(today);
    link.download = `${today.replace(/-/g, "")} - Rekapan Periode ${periodLabel}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    notify(`Rekap ${periodLabel} berhasil diunduh`);
  };
  const saveEmployee = async ({ name, phone, storeId, shiftId, role }) => {
    if (!db || !selectedEmployee) return;
    try {
      await setDoc(doc(db, "timekeeperEmployees", selectedEmployee.id), { id: selectedEmployee.id, name, phone, storeId, outletKey: storeId, role: role || selectedEmployee.role || "Karyawan", shiftId: shiftId || selectedEmployee.shiftId || "shift-1", active: true, updatedAt: serverTimestamp() }, { merge: true });
      setShowEdit(false);
      notify("Data karyawan tersimpan di Firestore");
    } catch (error) {
      notify(`Gagal menyimpan data karyawan: ${error.message}`);
    }
  };
  const createEmployee = async ({ name, phone, storeId, shiftId, role }) => {
    if (!db) return { ok: false, message: "Firebase belum siap." };
    if (employees.some((employee) => employee.name.trim().toLowerCase() === name.trim().toLowerCase() && employee.active !== false)) return { ok: false, message: "Nama karyawan tersebut sudah terdaftar." };
    const id = makeDocumentId(name);
    try {
      await setDoc(doc(db, "timekeeperEmployees", id), { id, name: name.trim(), phone: phone.trim(), role: role?.trim() || "Karyawan", shiftId: shiftId || "shift-1", storeId: storeId || "", outletKey: storeId || "", active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setShowEmployeeCreate(false);
      notify("Karyawan baru berhasil ditambahkan");
      return { ok: true };
    } catch (error) {
      return { ok: false, message: `Gagal menambahkan karyawan: ${error.message}` };
    }
  };
  const deleteEmployee = async (employee) => {
    if (!db) return;
    try {
      await setDoc(doc(db, "timekeeperEmployees", employee.id), { active: false, updatedAt: serverTimestamp() }, { merge: true });
      setShowEdit(false);
      goTo("employees");
      notify(`${employee.name} dihapus dari data aktif. Riwayat absensi tetap tersimpan.`);
    } catch (error) {
      notify(`Gagal menghapus karyawan: ${error.message}`);
    }
  };
  const saveOutlet = async ({ name, region, area }) => {
    if (!db || !selectedOutlet) return;
    try {
      await setDoc(doc(db, "timekeeperOutlets", selectedOutlet.id), { id: selectedOutlet.id, name, region, area: area || region, color: selectedOutlet.color || (region === "Utara" ? "purple" : region === "Barat" ? "orange" : "teal"), updatedAt: serverTimestamp() }, { merge: true });
      setShowOutletEdit(false);
      notify("Data outlet tersimpan di Firestore");
    } catch (error) {
      notify(`Gagal menyimpan outlet: ${error.message}`);
    }
  };
  const createOutlet = async ({ name, region, area }) => {
    if (!db) return { ok: false, message: "Firebase belum siap." };
    if (outletDirectory.some((outlet) => outlet.name.trim().toLowerCase() === name.trim().toLowerCase())) return { ok: false, message: "Nama outlet tersebut sudah terdaftar." };
    const id = makeDocumentId(name);
    try {
      await setDoc(doc(db, "timekeeperOutlets", id), { id, name: name.trim(), region, area: area?.trim() || region, color: region === "Utara" ? "purple" : region === "Barat" ? "orange" : "teal", active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setShowOutletCreate(false);
      notify("Outlet baru berhasil ditambahkan");
      return { ok: true };
    } catch (error) {
      return { ok: false, message: `Gagal menambahkan outlet: ${error.message}` };
    }
  };
  const deleteOutlet = async () => {
    if (!db || !selectedOutlet) return;
    try {
      await setDoc(doc(db, "timekeeperOutlets", selectedOutlet.id), { active: false, updatedAt: serverTimestamp() }, { merge: true });
      setSelectedOutletId(null);
      goTo("outlets");
      notify(`${selectedOutlet.name} dihapus dari daftar aktif. Riwayat absensi tetap tersimpan.`);
    } catch (error) {
      notify(`Gagal menghapus outlet: ${error.message}`);
    }
  };
  const assignEmployeeToOutlet = async (employee) => {
    if (!db || !selectedOutlet) return { ok: false, message: "Firebase belum siap." };
    const current = employees.find((item) => item.id === employee.id);
    if (current?.storeId && current.storeId !== selectedOutlet.id) {
      const currentOutlet = storeById[current.storeId]?.name || current.storeName || "outlet lain";
      return { ok: false, message: `Karyawan terdaftar di ${currentOutlet}. Silahkan hapus dulu dari ${currentOutlet} untuk memindahkan karyawan ke ${selectedOutlet.name}.` };
    }
    try {
      await setDoc(doc(db, "timekeeperEmployees", employee.id), { id: employee.id, name: employee.name, phone: employee.phone || employee.senderJid || "", role: employee.role || "Karyawan", shiftId: employee.shiftId || "shift-1", storeId: selectedOutlet.id, outletKey: selectedOutlet.id, active: true, updatedAt: serverTimestamp() }, { merge: true });
      notify(`${employee.name} ditambahkan ke ${selectedOutlet.name}`);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: `Gagal menambahkan karyawan: ${error.message}` };
    }
  };
  const removeEmployeeFromOutlet = async (employee) => {
    if (!db || !selectedOutlet) return;
    try {
      await setDoc(doc(db, "timekeeperEmployees", employee.id), { storeId: "", outletKey: "", updatedAt: serverTimestamp() }, { merge: true });
      notify(`${employee.name} dihapus dari ${selectedOutlet.name}`);
    } catch (error) {
      notify(`Gagal menghapus karyawan: ${error.message}`);
    }
  };
  const saveProfile = async ({ name, phone }) => {
    if (!user || !db) return { ok: false, message: "Firebase belum siap." };
    try {
      await updateProfile(user, { displayName: name.trim() });
      await setDoc(doc(db, "users", user.uid), { uid: user.uid, displayName: name.trim(), email: user.email || profile.email, whatsapp: phone.trim(), photoURL: profile.photoURL || user.photoURL || "", updatedAt: serverTimestamp() }, { merge: true });
      setProfile((current) => ({ ...current, name: name.trim(), phone: phone.trim() }));
      notify("Profil berhasil disimpan");
      return { ok: true };
    } catch (error) {
      return { ok: false, message: `Profil belum tersimpan: ${error.message}` };
    }
  };
  const uploadProfilePhoto = async (file) => {
    if (!user || !storage || !file) return { ok: false, message: "Penyimpanan foto belum siap." };
    if (!file.type.startsWith("image/")) return { ok: false, message: "Pilih file gambar." };
    if (file.size > 5 * 1024 * 1024) return { ok: false, message: "Ukuran foto maksimal 5 MB." };
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const photoRef = storageRef(storage, `profilePhotos/${user.uid}/avatar-${Date.now()}.${extension}`);
      await uploadBytes(photoRef, file, { contentType: file.type });
      const photoURL = await getDownloadURL(photoRef);
      await updateProfile(user, { photoURL });
      await setDoc(doc(db, "users", user.uid), { photoURL, updatedAt: serverTimestamp() }, { merge: true });
      setProfile((current) => ({ ...current, photoURL }));
      notify("Foto profil berhasil diupload");
      return { ok: true, photoURL };
    } catch (error) {
      return { ok: false, message: `Foto belum berhasil diupload: ${error.message}` };
    }
  };

  const dashboard = <LiveDashboardMockup today={today} timeZone={displayTimeZone} timeZoneLabel={displayTimeZoneLabel} records={records} todayRecords={currentRecords} employees={employees} outlets={outletDirectory} shifts={shifts} loading={dataLoading} error={dataError} onNavigate={goTo} onOpenEmployee={openEmployee} onNotify={notify} onExport={exportTemplate} />;
  let page = dashboard;
  if (active === "employees") page = <EmployeesPage employees={employees} storeById={storeById} shiftById={shiftById} shifts={shifts} search={search} setSearch={setSearch} onOpenEmployee={openEmployee} onNotify={notify} onAddEmployee={() => setShowEmployeeCreate(true)} />;
  if (active === "outlets") page = selectedOutlet ? <OutletEmployees store={selectedOutlet} employees={employees} records={records} today={today} shifts={shifts} shiftById={shiftById} storeById={storeById} onBack={() => setSelectedOutletId(null)} onOpenEmployee={openEmployee} onNotify={notify} onEditOutlet={() => setShowOutletEdit(true)} onDeleteOutlet={deleteOutlet} onAddEmployee={() => setShowAddEmployee(true)} onRemoveEmployee={removeEmployeeFromOutlet} /> : <OutletsPage outlets={outletDirectory} records={records} onOpenOutlet={setSelectedOutletId} onNotify={notify} onAddOutlet={() => setShowOutletCreate(true)} />;
  if (active === "settings") page = <SettingsPage settings={settings} shifts={shifts} onUpdateSettings={updateSettings} onConnectDrive={connectGoogleDrive} onBackupDrive={backupToGoogleDrive} driveConnected={driveConnected} backupBusy={backupBusy} backupProgress={backupProgress} onNotify={notify} />;
  if (active === "about") page = <AboutPage timeZoneLabel={displayTimeZoneLabel} />;
  if (active === "profile") page = <ProfilePage profile={profile} onBack={() => goTo("dashboard")} onSave={saveProfile} onUploadPhoto={uploadProfilePhoto} onLogout={logout} />;
  if (active === "employee-detail" && selectedEmployee) page = <EmployeeDetail employee={selectedEmployee} storeById={storeById} shiftById={shiftById} record={records.find((record) => record.employeeId === selectedEmployee.id && record.workDate === today) || records.find((record) => record.employeeId === selectedEmployee.id)} records={records.filter((record) => record.employeeId === selectedEmployee.id)} tab={detailTab} setTab={setDetailTab} onBack={() => goTo("employees")} onEdit={() => setShowEdit(true)} onDelete={() => deleteEmployee(selectedEmployee)} onHistory={() => setShowHistory(true)} />;

  return <div className="app-shell">
    <aside className="sidebar"><div className="sidebar-top"><Logo full /></div><nav className="side-nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={active === id || (id === "employees" && active === "employee-detail") || (id === "outlets" && active === "employee-detail") ? "active" : ""} onClick={() => goTo(id)}><Icon size={18} /><span>{label}</span>{id === "dashboard" && <i className="nav-dot" />}</button>)}</nav><div className="help-card"><div className="help-icon"><CircleHelp size={18} /></div><b>Butuh bantuan?</b><span>Pelajari cara kerja TimeKeeper</span><button onClick={() => notify("Pusat bantuan segera hadir")}>Buka pusat bantuan <ArrowRight size={14} /></button></div><div className="sidebar-bottom"><button className="profile-mini" onClick={() => goTo("profile")}><span className={`avatar avatar-small ${profile.photoURL ? "avatar-photo" : "avatar-admin"}`} style={profile.photoURL ? { backgroundImage: `url(${profile.photoURL})` } : undefined}>{!profile.photoURL && userInitials}</span><span><b>{userName}</b><small>Super Admin</small></span><ChevronRight size={17} /></button></div></aside>
    <main className="main-content"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => notify("Gunakan navigasi di bagian bawah") }><Menu size={20} /></button><div className="mobile-logo"><Logo compact /></div><div className="breadcrumbs"><span>{active === "employee-detail" ? "Data Karyawan" : active === "profile" ? "Profil" : navItems.find((item) => item.id === active)?.label || "Dashboard"}</span>{active === "employee-detail" && <><ChevronRight size={14} /><b>{selectedEmployee?.name}</b></>}</div><div className="top-actions"><div className="date-chip"><CalendarDays size={16} /><span>{todayLabel}</span></div><button className="icon-button notification" onClick={() => setShowNotifications(true)} aria-label="Buka notifikasi"><Bell size={18} />{unreadNotifications > 0 && <i className="notification-dot" />}</button><button className="icon-button theme-toggle" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Gunakan Light Mode" : "Gunakan Dark Mode"} title={theme === "dark" ? "Light Mode" : "Dark Mode"}>{theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}</button><button className="top-profile" onClick={() => goTo("profile")}><span className={`avatar avatar-small ${profile.photoURL ? "avatar-photo" : "avatar-admin"}`} style={profile.photoURL ? { backgroundImage: `url(${profile.photoURL})` } : undefined}>{!profile.photoURL && userInitials}</span><span><b>{userName}</b><small>Super Admin</small></span><ChevronDown size={14} /></button></div></header><div className="page-wrap">{page}</div></main>
    <nav className="bottom-nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={active === id || (id === "employees" && active === "employee-detail") ? "active" : ""} onClick={() => goTo(id)}><Icon size={19} /><span>{label === "Data Karyawan" ? "Karyawan" : label}</span></button>)}</nav>
    {showEdit && selectedEmployee && <EditEmployee employee={selectedEmployee} outlets={outletDirectory} shifts={shifts} onClose={() => setShowEdit(false)} onSave={saveEmployee} />}
    {showEmployeeCreate && <EmployeeFormModal outlets={outletDirectory} shifts={shifts} onClose={() => setShowEmployeeCreate(false)} onSave={createEmployee} />}
    {showOutletEdit && selectedOutlet && <EditOutlet outlet={selectedOutlet} onClose={() => setShowOutletEdit(false)} onSave={saveOutlet} />}
    {showOutletCreate && <OutletFormModal onClose={() => setShowOutletCreate(false)} onSave={createOutlet} />}
    {showAddEmployee && selectedOutlet && <AddEmployeeToOutlet employees={employees} storeById={storeById} outlet={selectedOutlet} onClose={() => setShowAddEmployee(false)} onAssign={assignEmployeeToOutlet} />}
    {showHistory && selectedEmployee && <HistoryDrawer employee={selectedEmployee} records={records.filter((record) => record.employeeId === selectedEmployee.id)} onClose={() => setShowHistory(false)} />}
    {showNotifications && <NotificationsDrawer notifications={lateNotifications} unreadCount={unreadNotifications} onClose={() => setShowNotifications(false)} onReadAll={() => setNotificationsRead(true)} onOpenEmployee={(employeeId) => { setShowNotifications(false); openEmployee(employeeId); }} />}
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>;
}

function PageTitle({ eyebrow, title, description, action }) { return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>; }

function LiveDashboard({ userName, todayLabel, timeZone, timeZoneLabel, records, employees, outlets, loading, error, onNavigate, onOpenEmployee, onNotify, onExport }) {
  const present = employees.filter((employee) => ["present", "working", "late", "overtime"].includes(employee.status));
  const late = employees.filter((employee) => employee.status === "late");
  const overtime = employees.filter((employee) => employee.status === "overtime");
  const absent = employees.filter((employee) => employee.status === "absent");
  const employeeById = Object.fromEntries(employees.map((employee) => [employee.id, employee]));
  const outletById = Object.fromEntries(outlets.map((outlet) => [outlet.id, outlet]));
  const latestRecords = [...records].sort((a, b) => (b.updatedAt?.getTime?.() || 0) - (a.updatedAt?.getTime?.() || 0)).slice(0, 4);
  const firstName = userName.split(/\s+/)[0];
  const greeting = getTimeGreeting(new Date(), timeZone);
  const emptyMessage = loading ? "Menghubungkan ke data Firebase..." : error ? "Data live gagal dimuat. Coba muat ulang halaman." : "Belum ada data absensi untuk hari ini.";
  return <><PageTitle eyebrow={`OVERVIEW / ${formatMonthYear(new Date(), timeZone)}`} title={`Selamat ${greeting}, ${firstName}`} description="Berikut ringkasan kehadiran tim kamu hari ini." action={<button className="primary-button" onClick={onExport}>Export rekap <ArrowRight size={16} /></button>} /><section className="period-banner"><div className="period-mark"><CalendarDays size={20} /></div><div><span>Periode berjalan</span><strong>11–25 Juli 2026</strong></div><div className="period-state"><span className="status-pill blue"><span />Periode aktif</span><button onClick={() => onNotify("Detail periode dibuka")}>Lihat detail <ArrowRight size={14} /></button></div></section><div className="section-heading"><div><h2>Ringkasan hari ini</h2><p>{todayLabel} <span className="muted-dot">·</span> {timeZoneLabel}</p></div><button className="quiet-button" onClick={() => onNotify("Filter outlet: semua outlet") }><Filter size={15} /> Semua outlet <ChevronRight size={15} /></button></div><section className="metrics-grid"><MetricCard icon={Check} tone="green" label="Hadir hari ini" value={present.length} note={`dari ${employees.length} karyawan`} onClick={() => onNavigate("employees")} /><MetricCard icon={Clock3} tone="yellow" label="Terlambat" value={late.length} note="Berdasarkan absensi live" onClick={() => onNavigate("employees")} /><MetricCard icon={Sparkles} tone="purple" label="Sedang lembur" value={overtime.length} note="Sesi lembur aktif" onClick={() => onNavigate("employees")} /><MetricCard icon={UserRound} tone="gray" label="Belum absen" value={absent.length} note="Perlu ditindaklanjuti" onClick={() => onNavigate("employees")} /></section><div className="dashboard-grid"><section className="panel activity-panel"><div className="panel-heading"><div><h2>Aktivitas terbaru</h2><p>Update absensi real-time dari seluruh outlet</p></div><button className="text-button" onClick={() => onNavigate("employees")}>Lihat semua <ArrowRight size={15} /></button></div><div className="activity-list">{latestRecords.length ? latestRecords.map((record) => { const employee = employeeById[record.employeeId]; const outlet = outletById[record.storeId]; const status = record.attendanceStatus === "DAY_OFF" ? "libur" : record.actualCheckOutAt ? "menyelesaikan absensi" : "melakukan absen masuk"; return <Activity key={record.id} icon={record.punctualityStatus === "LATE" ? Clock3 : record.overtimeEligible ? Sparkles : Check} tone={record.punctualityStatus === "LATE" ? "yellow" : record.overtimeEligible ? "purple" : "green"} name={record.employeeNameSnapshot || employee?.name || "Karyawan"} action={status} time={record.actualCheckInAt ? formatTime(record.actualCheckInAt, timeZone) : "—"} meta={`${outlet?.name || record.outletName || "Outlet belum ditentukan"} · ${record.workDate}`} />; }) : <div className="empty-state">{emptyMessage}</div>}</div></section><section className="panel late-panel"><div className="panel-heading"><div><h2>Perlu perhatian</h2><p>Data live yang membutuhkan tindakan</p></div><button className="icon-button" onClick={() => onNotify("Menu perhatian dibuka") }><MoreHorizontal size={18} /></button></div>{late.slice(0, 3).map((employee) => <div className="attention-item" key={`late-${employee.id}`}><div className="attention-number">{String(employee.totalLate).padStart(2, "0")}</div><div><b>{employee.name}</b><span>Terlambat hari ini</span></div><button onClick={() => onOpenEmployee(employee.id)}><ArrowRight size={16} /></button></div>)}{overtime.slice(0, 3).map((employee) => <div className="attention-item" key={`overtime-${employee.id}`}><div className="attention-number purple-text">{String(employee.totalOvertime).padStart(2, "0")}</div><div><b>{employee.name}</b><span>Memiliki jam lembur</span></div><button onClick={() => onOpenEmployee(employee.id)}><ArrowRight size={16} /></button></div>)}{absent.slice(0, 3).map((employee) => <div className="attention-item" key={`absent-${employee.id}`}><div className="attention-number muted-text">00</div><div><b>{employee.name}</b><span>Belum absen hari ini</span></div><button onClick={() => onOpenEmployee(employee.id)}><MessageCircle size={16} /></button></div>)}{!late.length && !overtime.length && !absent.length && <div className="empty-state">Tidak ada perhatian khusus.</div>}</section></div><section className="insight-strip"><div className="insight-icon"><Gauge size={20} /></div><div><b>{outlets.length ? `${outlets.length} outlet terhubung` : "Belum ada outlet terhubung"}</b><span>Ringkasan dihitung dari data Firestore live.</span></div><div className="insight-chart"><span style={{ height: present.length ? "70%" : "12%" }} /><span style={{ height: late.length ? "45%" : "12%" }} /><span style={{ height: overtime.length ? "60%" : "12%" }} /></div></section></>;
}

function LiveDashboardMockup({ today, timeZone, timeZoneLabel, records, todayRecords, employees, outlets, shifts = SHIFTS, loading, error, onNavigate, onOpenEmployee, onNotify, onExport }) {
  const present = employees.filter((employee) => ["present", "working", "late", "overtime"].includes(employee.status));
  const late = employees.filter((employee) => employee.status === "late");
  const absent = employees.filter((employee) => employee.status === "absent");
  const overtimeRecords = todayRecords.filter((record) => record.overtimeEligible || record.extraMinutes > 0);
  const totalOvertimeMinutes = overtimeRecords.reduce((sum, record) => sum + (record.extraMinutes || record.paidOvertimeHours * 60 || 0), 0);
  const previousDay = getPreviousIsoDate(today);
  const todayStats = buildDashboardDayStats(today, records, employees.length);
  const previousStats = buildDashboardDayStats(previousDay, records, employees.length);
  const presentTrend = calculateDashboardTrend(todayStats.present, previousStats.present, "increase");
  const lateTrend = calculateDashboardTrend(todayStats.late, previousStats.late, "decrease");
  const absentTrend = calculateDashboardTrend(todayStats.absent, previousStats.absent, "decrease");
  const overtimeTrend = calculateDashboardTrend(totalOvertimeMinutes, previousStats.overtimeMinutes, "increase");
  const employeeById = Object.fromEntries(employees.map((employee) => [employee.id, employee]));
  const outletById = Object.fromEntries(outlets.map((outlet) => [outlet.id, outlet]));
  const latestRecords = [...todayRecords].sort((a, b) => (b.actualCheckInAt?.getTime?.() || 0) - (a.actualCheckInAt?.getTime?.() || 0)).slice(0, 5);
  const period = getPeriodRange(today);
  const periodRecords = records.filter((record) => record.workDate >= period.startDate && record.workDate <= period.endDate);
  const periodLate = periodRecords.filter((record) => record.punctualityStatus === "LATE");
  const periodLeave = periodRecords.filter((record) => record.attendanceStatus === "DAY_OFF");
  const periodOvertimeMinutes = periodRecords.reduce((sum, record) => sum + (record.extraMinutes || record.paidOvertimeHours * 60 || 0), 0);
  const shiftSummary = shifts.map((shift) => {
    const members = employees.filter((employee) => employee.shiftId === shift.id);
    return { shift, total: members.length, present: members.filter((employee) => employee.status !== "absent").length, late: members.filter((employee) => employee.status === "late").length, absent: members.filter((employee) => employee.status === "absent").length };
  });
  const lateRows = late.map((employee) => ({ employee, record: todayRecords.find((record) => record.employeeId === employee.id) }));
  const getShift = (shiftId) => shifts.find((shift) => shift.id === shiftId) || shifts[0];
  const emptyMessage = loading ? "Menghubungkan ke data Firebase..." : error ? "Data live gagal dimuat. Coba muat ulang halaman." : "Belum ada data absensi untuk hari ini.";
  const totalEmployees = employees.length;
  const percentage = (value) => totalEmployees ? `${((value / totalEmployees) * 100).toFixed(1)}%` : "0%";
  return <div className="dashboard-live">
    <section className="dashboard-kpi-grid">
      <DashboardKpi icon={Users} tone="green" label="Hadir Hari Ini" value={present.length} suffix="Orang" note={`${percentage(present.length)} dari total karyawan`} trend={presentTrend} />
      <DashboardKpi icon={Clock3} tone="orange" label="Terlambat" value={late.length} suffix="Orang" note={`${percentage(late.length)} dari total karyawan`} trend={lateTrend} />
      <DashboardKpi icon={UserRound} tone="gray" label="Belum Absen" value={absent.length} suffix="Orang" note={`${percentage(absent.length)} dari total karyawan`} trend={absentTrend} />
      <DashboardKpi icon={AlarmClock} tone="purple" label="Total Lembur Hari Ini" value={Math.floor(totalOvertimeMinutes / 60)} valueDetail={`jam ${String(totalOvertimeMinutes % 60).padStart(2, "0")} menit`} note={`${overtimeRecords.length} Karyawan`} trend={overtimeTrend} />
    </section>

    <section className="dashboard-main-grid">
      <section className="panel dashboard-card dashboard-donut-card">
        <DashboardCardHeading title="Ringkasan Absensi Hari Ini" subtitle={`${formatTodayLabel(new Date(), timeZone)} · ${timeZoneLabel}`} />
        <div className="attendance-summary-content"><AttendanceDonut present={present.length} late={late.length} absent={absent.length} total={totalEmployees} /><div className="attendance-legend"><LegendRow tone="green" label="Hadir" value={present.length} percentage={percentage(present.length)} /><LegendRow tone="orange" label="Terlambat" value={late.length} percentage={percentage(late.length)} /><LegendRow tone="gray" label="Belum Absen" value={absent.length} percentage={percentage(absent.length)} /></div></div>
        <button className="dashboard-link" onClick={() => onNavigate("employees")}>Lihat detail <ArrowRight size={14} /></button>
      </section>

      <section className="panel dashboard-card dashboard-realtime-card">
        <DashboardCardHeading title="Absensi Real-time" subtitle="Data masuk yang diterima hari ini" />
        <div className="realtime-list">{latestRecords.length ? latestRecords.map((record) => { const employee = employeeById[record.employeeId]; const outlet = outletById[record.storeId]; return <RealtimeRow key={record.id} record={record} employee={employee} outlet={outlet} shift={getShift(record.shiftId)} timeZone={timeZone} onClick={() => employee && onOpenEmployee(employee.id)} />; }) : <div className="empty-state">{emptyMessage}</div>}</div>
        <button className="dashboard-link" onClick={() => onNavigate("employees")}>Lihat semua aktivitas <ArrowRight size={14} /></button>
      </section>

      <section className="panel dashboard-card dashboard-shifts-card">
        <DashboardCardHeading title="Shift Hari Ini" subtitle="Distribusi kehadiran per shift" />
        <div className="shift-summary-list">{shiftSummary.map(({ shift, total, present: shiftPresent, late: shiftLate, absent: shiftAbsent }) => <div className="shift-summary-row" key={shift.id}><div className="shift-summary-heading"><b>{shift.name}</b><span>{shift.startTime} – {shift.endTime}</span><ChevronRight size={14} /></div><div className="shift-summary-stats"><span>Karyawan <b>{total}</b></span><span className="green-text">Hadir <b>{shiftPresent}</b></span><span className="orange-text">Terlambat <b>{shiftLate}</b></span><span className="gray-text">Belum Absen <b>{shiftAbsent}</b></span></div></div>)}</div>
        <button className="dashboard-link" onClick={() => onNavigate("employees")}>Lihat semua shift <ArrowRight size={14} /></button>
      </section>
    </section>

    <section className="dashboard-tables-grid">
      <section className="panel dashboard-table-card"><DashboardCardHeading title="Keterlambatan (Periode Berjalan)" subtitle="Karyawan yang terlambat masuk" /><DashboardTableHead labels={["Nama Karyawan", "Tanggal", "Shift", "Jam Masuk", "Terlambat"]} />{lateRows.length ? lateRows.slice(0, 6).map(({ employee, record }) => <div className="dashboard-table-row" key={employee.id}><b>{employee.name}</b><span>{record?.workDate ? formatDateShort(record.workDate).day + " " + formatDateShort(record.workDate).month : "—"}</span><span>{getShift(employee.shiftId)?.name || "—"}</span><span>{record?.actualCheckInAt ? formatTime(record.actualCheckInAt, timeZone) : "—"}</span><strong className="orange-text">{record?.lateMinutes || 0} menit</strong></div>) : <div className="empty-state">Belum ada keterlambatan live.</div>}<button className="dashboard-link" onClick={() => onNavigate("employees")}>Lihat semua keterlambatan <ArrowRight size={14} /></button></section>
      <section className="panel dashboard-table-card"><DashboardCardHeading title="Lembur Hari Ini" subtitle="Karyawan dengan jam lembur" /><DashboardTableHead labels={["Nama Karyawan", "Outlet", "Shift", "Jam Lembur", "Tipe Lembur"]} />{overtimeRecords.length ? overtimeRecords.slice(0, 6).map((record) => { const employee = employeeById[record.employeeId]; return <div className="dashboard-table-row" key={record.id}><b>{record.employeeNameSnapshot || employee?.name || "Karyawan"}</b><span>{outletById[record.storeId]?.name || record.outletName || "—"}</span><span>{getShift(record.shiftId)?.name || "—"}</span><span>{formatReadableMinutes(record.extraMinutes || record.paidOvertimeHours * 60 || 0)}</span><strong className="purple-text">{record.paidOvertimeHours ? `${record.paidOvertimeHours} Jam` : "Belum dihitung"}</strong></div>; }) : <div className="empty-state">Belum ada lembur live.</div>}<button className="dashboard-link" onClick={() => onNotify("Daftar lembur lengkap segera tersedia")}>Lihat semua lembur <ArrowRight size={14} /></button></section>
    </section>

    <section className="panel dashboard-period-card"><div className="period-summary-icon"><CalendarDays size={20} /></div><div className="period-summary-title"><span>Periode Berjalan</span><b>{formatPeriodDate(period.startDate, timeZone)} – {formatPeriodDate(period.endDate, timeZone)}</b></div><PeriodStat label="Total Hari" value={daysBetween(period.startDate, period.endDate)} /><PeriodStat label="Hari Kerja" value={new Set(periodRecords.map((record) => record.workDate)).size} /><PeriodStat label="Hadir" value={new Set(periodRecords.filter((record) => record.attendanceStatus !== "DAY_OFF").map((record) => record.employeeId)).size} /><PeriodStat label="Terlambat" value={periodLate.length} /><PeriodStat label="Libur" value={periodLeave.length} /><PeriodStat label="Total Jam Lembur" value={formatReadableMinutes(periodOvertimeMinutes)} /><button className="quiet-button" onClick={onExport}><WalletCards size={15} /> Lihat Rekap Periode</button></section>
  </div>;
}

function DashboardKpi({ icon: Icon, tone, label, value, suffix, valueDetail, valueClass = "", note, trend }) { return <div className="dashboard-kpi"><span className={`dashboard-kpi-icon ${tone}`}><Icon size={20} /></span><div className="dashboard-kpi-copy"><span>{label}</span><strong className={valueClass}>{value} <small>{valueDetail || suffix}</small></strong>{(note || trend) && <div className="dashboard-kpi-footer">{note && <em>{note}</em>}{trend && <b className={`kpi-trend ${trend.tone}`}>{trend.direction === "up" ? <ArrowUp size={10} /> : trend.direction === "down" ? <ArrowDown size={10} /> : null}{trend.label}</b>}</div>}</div></div>; }
function DashboardCardHeading({ title, subtitle, action }) { return <div className="dashboard-card-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>; }
function DashboardTableHead({ labels }) { return <div className="dashboard-table-head">{labels.map((label) => <span key={label}>{label}</span>)}</div>; }
function PeriodStat({ label, value }) { return <div className="period-stat"><span>{label}</span><b>{value}</b></div>; }
function LegendRow({ tone, label, value, percentage }) { return <div className="legend-row"><span className={`legend-dot ${tone}`} /><b>{label}</b><span>{value} Orang</span><small>{percentage}</small></div>; }
function AttendanceDonut({ present, late, absent, total }) { const safeTotal = total || 1; const circumference = 2 * Math.PI * 42; const presentLength = (present / safeTotal) * circumference; const lateLength = (late / safeTotal) * circumference; return <div className="attendance-donut"><svg viewBox="0 0 110 110" aria-label="Ringkasan absensi"><circle className="donut-track" cx="55" cy="55" r="42" /><circle className="donut-segment donut-present" cx="55" cy="55" r="42" strokeDasharray={`${presentLength} ${circumference - presentLength}`} /><circle className="donut-segment donut-late" cx="55" cy="55" r="42" strokeDasharray={`${lateLength} ${circumference - lateLength}`} strokeDashoffset={-presentLength} /><circle className="donut-segment donut-absent" cx="55" cy="55" r="42" strokeDasharray={`${(absent / safeTotal) * circumference} ${circumference - ((absent / safeTotal) * circumference)}`} strokeDashoffset={-(presentLength + lateLength)} /></svg><div><strong>{total}</strong><span>Total Karyawan</span></div></div>; }
function RealtimeRow({ record, employee, outlet, shift, timeZone, onClick }) { const isLate = record.punctualityStatus === "LATE"; const isAbsent = record.attendanceStatus === "DAY_OFF" || !record.actualCheckInAt; const status = isAbsent ? "Belum Absen" : isLate ? "Terlambat" : "Tepat Waktu"; return <button className="realtime-row" onClick={onClick}><span className={`avatar avatar-small avatar-${employee?.accent || "blue"}`}>{employee?.initials || (record.employeeNameSnapshot || "K").slice(0, 2).toUpperCase()}</span><span className="realtime-copy"><b>{record.employeeNameSnapshot || employee?.name || "Karyawan"}</b><small>{shift?.name || "Shift"} ({shift?.startTime || "—"} – {shift?.endTime || "—"}) · {outlet?.name || record.outletName || "Outlet"}</small></span><time>{record.actualCheckInAt ? formatTime(record.actualCheckInAt, timeZone) : "—"}</time><span className={`realtime-status ${isAbsent ? "gray" : isLate ? "orange" : "green"}`}>{status}{isLate && record.lateMinutes ? <small>{record.lateMinutes} menit</small> : null}</span></button>; }

function MetricCard({ icon: Icon, tone, label, value, note, onClick }) { return <button className="metric-card" onClick={onClick}><span className={`metric-icon ${tone}`}><Icon size={18} /></span><span className="metric-label">{label}<ChevronRight size={15} /></span><strong>{value}</strong><small>{note}</small></button>; }
function Activity({ icon: Icon, tone, name, action, time, meta }) { return <div className="activity-row"><span className={`activity-icon ${tone}`}><Icon size={16} /></span><div className="activity-copy"><b>{name} <span>{action}</span></b><small>{meta}</small></div><time>{time}</time></div>; }

function NotificationsDrawer({ notifications, unreadCount, onClose, onReadAll, onOpenEmployee }) {
  return <div className="notification-backdrop" onMouseDown={onClose}><aside className="notification-drawer" onMouseDown={(event) => event.stopPropagation()}><div className="notification-heading"><div><div className="eyebrow">WORKSPACE / ALERTS</div><h2>Notifikasi</h2><p>Perhatian dari data kehadiran live.</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="notification-toolbar"><span className="notification-count">{unreadCount} belum dibaca</span><button className="read-all-button" onClick={onReadAll}>Read All</button></div>{notifications.length > 1 && <div className="notification-summary"><Bell size={16} /><span>Ada <b>{notifications.length} karyawan</b> yang memiliki keterlambatan lebih dari 2x.</span></div>}<div className="notification-list">{notifications.length ? notifications.map(({ id, employee, title, detail }) => <button className="notification-item" key={id} onClick={() => onOpenEmployee(employee.id)}><span className="notification-item-icon"><Clock3 size={16} /></span><span><b>{title}</b><small>{detail}</small></span><ChevronRight size={15} /></button>) : <div className="notification-empty"><Bell size={22} /><b>Belum ada notifikasi</b><span>Notifikasi keterlambatan akan muncul di sini.</span></div>}</div></aside></div>;
}

function LegacyEmployeesPage({ employees, storeById, shiftById, search, setSearch, onOpenEmployee, onNotify }) {
  const filtered = employees.filter((e) => `${e.name} ${storeById[e.storeId]?.name || e.storeName || ""}`.toLowerCase().includes(search.toLowerCase()));
  return <><PageTitle eyebrow="TIM / DIRECTORY" title="Data karyawan" description="Data karyawan yang tersimpan di Firestore." action={<button className="primary-button" onClick={() => onNotify("Tambahkan karyawan melalui WhatsApp Bot atau koleksi Firestore") }><Plus size={16} /> Tambah karyawan</button>} /><div className="toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau outlet..." /></div><button className="quiet-button" onClick={() => onNotify("Filter aktif: status dan outlet") }><SlidersHorizontal size={15} /> Filter</button></div><div className="directory-card panel"><div className="table-head"><span>Karyawan</span><span>Outlet</span><span>Shift</span><span>Status hari ini</span><span /></div>{filtered.map((employee) => <EmployeeRow key={employee.id} employee={employee} storeById={storeById} shiftById={shiftById} onClick={() => onOpenEmployee(employee.id)} />)}{filtered.length === 0 && <div className="empty-state">Belum ada data karyawan live.</div>}<div className="table-footer">Menampilkan <b>{filtered.length}</b> dari <b>{employees.length}</b> karyawan</div></div></>;
}

function EmployeesPage({ employees, storeById, shiftById, shifts = SHIFTS, search, setSearch, onOpenEmployee, onNotify, onAddEmployee }) {
  const [outletFilter, setOutletFilter] = useState("Semua Outlet");
  const [shiftFilter, setShiftFilter] = useState("Semua Shift");
  const outletOptions = ["Semua Outlet", ...Object.values(storeById).map((outlet) => outlet.name).sort()];
  const filtered = employees.filter((employee) => {
    const outletName = storeById[employee.storeId]?.name || employee.storeName || "Belum ditentukan";
    const shift = shiftById[employee.shiftId] || shifts[0];
    const haystack = `${employee.name} ${outletName} ${employee.phone || ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (outletFilter === "Semua Outlet" || outletName === outletFilter) && (shiftFilter === "Semua Shift" || shift.name === shiftFilter);
  });
  return <>
    <PageTitle eyebrow="TIM / DIRECTORY" title="Data Karyawan" description="Kelola dan lihat data seluruh karyawan." action={<button className="primary-button" onClick={onAddEmployee}><Plus size={16} /> Tambah Karyawan</button>} />
    <div className="toolbar employee-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari karyawan..." /></div><label className="select-box"><select value={outletFilter} onChange={(event) => setOutletFilter(event.target.value)}>{outletOptions.map((outlet) => <option key={outlet}>{outlet}</option>)}</select><ChevronRight size={14} /></label><label className="select-box"><select value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value)}><option>Semua Shift</option>{shifts.map((shift) => <option key={shift.id}>{shift.name}</option>)}</select><ChevronRight size={14} /></label></div>
    <div className="directory-card panel employee-directory"><div className="table-head"><span aria-hidden="true" /><span>Nama Karyawan</span><span>Outlet</span><span>Shift</span><span>Status</span><span>No. WhatsApp</span><span>Aksi</span></div>{filtered.map((employee) => <DirectoryEmployeeRow key={employee.id} employee={employee} storeById={storeById} shiftById={shiftById} onClick={() => onOpenEmployee(employee.id)} />)}{filtered.length === 0 && <div className="empty-state">Belum ada data karyawan live.</div>}<div className="table-footer">Menampilkan <b>{filtered.length}</b> dari <b>{employees.length}</b> karyawan</div></div>
  </>;
}

function LegacyEmployeeRow({ employee, storeById, shiftById, onClick }) { const shift = shiftById[employee.shiftId] || SHIFTS[0]; const outlet = storeById[employee.storeId]; return <button className="employee-row" onClick={onClick}><span className={`avatar avatar-medium avatar-${employee.accent}`}>{employee.initials}</span><span className="employee-main"><b>{employee.name}</b><small>{employee.role}</small></span><span className="row-outlet"><MapPin size={14} />{(outlet?.name || employee.storeName || "Belum ditentukan").replace("Laundry ", "")}</span><span className="row-shift">{shift.name}<small>{shift.startTime} – {shift.endTime}</small></span><span className={`status-pill ${employee.status}`}><span />{statusLabel(employee.status)}</span><ChevronRight className="row-chevron" size={17} /></button>; }

function DirectoryEmployeeRow({ employee, storeById, shiftById, onClick }) {
  const shift = shiftById[employee.shiftId] || SHIFTS[0];
  const outlet = storeById[employee.storeId];
  const phone = formatWhatsAppPhone(employee.phone || employee.senderJid);
  return <button className="employee-row" onClick={onClick} aria-label={`Buka detail karyawan ${employee.name}`}>
    <span className={`avatar avatar-medium avatar-${employee.accent}`}>{employee.initials}</span>
    <span className="employee-main"><b>{employee.name}</b><small>{employee.role}</small></span>
    <span className="row-outlet"><MapPin size={14} />{(outlet?.name || employee.storeName || "Belum ditentukan").replace("Laundry ", "")}</span>
    <span className="row-shift">{shift.name}<small>{shift.startTime} – {shift.endTime}</small></span>
    <span className="row-status"><span className={`status-pill ${employee.status}`}><span />{statusLabel(employee.status)}</span></span>
    <span className="row-phone">{phone !== "—" && <Phone size={13} />}{phone}</span>
    <ChevronRight className="row-chevron" size={17} />
  </button>;
}

function EmployeeRow(props) {
  return <LegacyEmployeeRow {...props} />;
}

function OutletsPage({ outlets, records, onOpenOutlet, onNotify, onAddOutlet }) {
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("Semua Wilayah");
  const filteredOutlets = outlets.filter((outlet) => (regionFilter === "Semua Wilayah" || outlet.region === regionFilter) && outlet.name.toLowerCase().includes(search.toLowerCase()));
  const groupedOutlets = regionOrder.map((region) => ({ region, outlets: filteredOutlets.filter((outlet) => outlet.region === region) }));
  return <><PageTitle eyebrow="OPERATIONS / LOCATIONS" title="Daftar Outlet" description="Outlet yang tersimpan dari data operasional live." action={<button className="primary-button" onClick={onAddOutlet}><Plus size={16} /> Tambah outlet</button>} /><section className="outlet-stats">{regionOrder.map((region) => <div className={`outlet-stat ${region.toLowerCase()}`} key={region}><span className="outlet-stat-icon"><Landmark size={19} /></span><div><b>{region}</b><strong>{outlets.filter((outlet) => outlet.region === region).length}</strong><small>Total Outlet</small></div></div>)}</section><div className="outlet-directory-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari outlet..." /></div><div className="region-tabs">{["Semua Wilayah", ...regionOrder].map((region) => <button key={region} className={regionFilter === region ? "active" : ""} onClick={() => setRegionFilter(region)}>{region}</button>)}</div></div><div className="outlet-directory-grid">{groupedOutlets.filter((group) => group.outlets.length > 0).map((group) => <section className={`outlet-group ${group.region.toLowerCase()}`} key={group.region}><div className="outlet-group-heading"><div><span className="outlet-region-icon"><Landmark size={20} /></span><h2>{group.region}</h2></div><span>{group.outlets.length} Outlet</span></div><div className="outlet-list">{group.outlets.map((outlet) => { const outletRecords = records.filter((record) => record.storeId === outlet.id); const employeeCount = new Set(outletRecords.map((record) => record.employeeId)).size; return <button className="directory-outlet-row" key={outlet.id} onClick={() => onOpenOutlet(outlet.id)}><span className={`directory-outlet-icon ${outlet.color}`}><Landmark size={17} /></span><span className="directory-outlet-name"><b>{outlet.name}</b><small>{outlet.region}</small></span><span className="directory-outlet-metric"><strong>{employeeCount}</strong><small>Karyawan</small></span><span className="directory-outlet-metric"><strong>{outletRecords.length}</strong><small>Absensi</small></span><ChevronRight size={17} /></button>; })}</div></section>)}</div>{filteredOutlets.length === 0 && <div className="empty-state panel">Belum ada outlet live.</div>}<div className="outlet-note"><ShieldCheck size={18} /><span><b>{outlets.length} outlet terhubung</b><small>Data mengikuti koleksi Firestore dan laporan WhatsApp.</small></span><Cloud size={18} /></div></>;
}

function LegacyOutletEmployees({ store, employees, storeById, shiftById, onBack, onOpenEmployee, onNotify }) { const members = employees.filter((e) => e.storeId === store.id); return <><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Semua outlet</button><PageTitle eyebrow="OUTLET / LOCATION DETAIL" title={store.name} description={`${store.area || store.region} · ${members.length} karyawan ditugaskan`} action={<button className="quiet-button" onClick={() => onNotify("Menu kelola outlet dibuka")}><MoreHorizontal size={16} /> Kelola outlet</button>} /><div className="outlet-summary"><div><span>Hadir</span><b>{members.filter((e) => e.status !== "absent").length}</b></div><div><span>Terlambat</span><b>{members.filter((e) => e.status === "late").length}</b></div><div><span>Shift aktif</span><b>{new Set(members.map((e) => e.shiftId)).size}</b></div></div><section className="panel outlet-members"><div className="panel-heading"><div><h2>Daftar karyawan</h2><p>Pilih karyawan untuk melihat detail lengkap.</p></div><button className="quiet-button" onClick={() => onNotify("Filter status outlet dibuka")}><Filter size={15} /> Status</button></div>{members.length ? members.map((employee) => <EmployeeRow key={employee.id} employee={employee} storeById={storeById} shiftById={shiftById} onClick={() => onOpenEmployee(employee.id)} />) : <div className="empty-state">Belum ada karyawan di outlet ini.</div>}</section></>; }

function OutletEmployees({ store, employees, records, today, shifts = SHIFTS, shiftById, storeById, onBack, onOpenEmployee, onNotify, onEditOutlet, onDeleteOutlet, onAddEmployee, onRemoveEmployee }) {
  const members = employees.filter((employee) => employee.storeId === store.id);
  const todayRecords = Object.fromEntries(records.filter((record) => record.workDate === today && record.storeId === store.id).map((record) => [record.employeeId, record]));
  const activeShifts = new Set(members.map((employee) => employee.shiftId)).size;
  return <>
    <div className="outlet-detail-heading"><div><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Semua outlet</button><div className="eyebrow">OUTLET / LOCATION DETAIL</div><h1>{store.name}</h1><p>{store.region || store.area || "Wilayah belum ditentukan"}</p></div><div className="outlet-detail-actions"><button className="quiet-button" onClick={onEditOutlet}><Edit3 size={14} /> Edit Outlet</button><button className="danger-button" onClick={() => { if (window.confirm(`Hapus ${store.name} dari daftar outlet aktif? Histori absensi tetap tersimpan.`)) onDeleteOutlet(); }}>Hapus Outlet</button></div></div>
    <section className="outlet-summary outlet-detail-summary"><div><span><Users size={14} /> Total Karyawan</span><b>{members.length}</b></div><div><span><Clock3 size={14} /> Shift Aktif</span><b>{activeShifts}<small> Shift · 07.00–23.00</small></b></div><div><span><CalendarDays size={14} /> Jam Operasional</span><b>24 Jam</b></div></section>
    <section className="panel outlet-members outlet-detail-members"><div className="panel-heading"><div><h2>Karyawan di Outlet Ini</h2><p>Kelola karyawan yang terdaftar pada {store.name}.</p></div><label className="select-box outlet-shift-filter"><select defaultValue="Semua Shift"><option>Semua Shift</option>{shifts.map((shift) => <option key={shift.id}>{shift.name}</option>)}</select><ChevronRight size={14} /></label></div><div className="outlet-employee-table"><div className="outlet-table-head"><span>Nama Karyawan</span><span>Shift</span><span>Jam Masuk</span><span>Status</span><span>Aksi</span></div>{members.length ? members.map((employee) => { const shift = shiftById[employee.shiftId] || shifts[0]; const record = todayRecords[employee.id]; const checkIn = record?.actualCheckInAt ? formatTime(record.actualCheckInAt) : "—"; return <div className="outlet-employee-row" key={employee.id}><button className="outlet-employee-name" onClick={() => onOpenEmployee(employee.id)}><span className={`avatar avatar-small avatar-${employee.accent}`}>{employee.initials}</span><span><b>{employee.name}</b><small>{employee.phone ? formatWhatsAppPhone(employee.phone) : "Nomor belum tercatat"}</small></span></button><span className="outlet-shift-cell"><b>{shift.name}</b><small>{shift.startTime} – {shift.endTime}</small></span><span className="outlet-time-cell">{checkIn}</span><span className={`status-pill ${employee.status}`}><span />{statusLabel(employee.status)}</span><button className="icon-button danger-icon" title={`Hapus ${employee.name} dari ${store.name}`} onClick={() => onRemoveEmployee(employee)}><Trash2 size={15} /></button></div>; }) : <div className="empty-state">Belum ada karyawan di outlet ini.</div>}</div><button className="add-employee-button" onClick={onAddEmployee}><Plus size={16} /> Tambah Karyawan</button></section>
  </>;
}

function LegacyEmployeeDetail({ employee, storeById, shiftById, record, records, onBack, onEdit, onHistory, tab, setTab }) { const shift = shiftById[employee.shiftId] || SHIFTS[0]; const store = storeById[employee.storeId] || { name: employee.storeName || "Belum ditentukan" }; return <><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Kembali ke Data Karyawan</button><div className="detail-hero"><div className={`avatar avatar-large avatar-${employee.accent}`}>{employee.initials}</div><div className="detail-identity"><div className="eyebrow">EMPLOYEE PROFILE</div><h1>{employee.name}</h1><p>{employee.role} · {store.name}</p><span className={`status-pill ${employee.status}`}><span />{statusLabel(employee.status)} hari ini</span></div><div className="detail-actions"><button className="quiet-button" onClick={onHistory}><History size={15} /> Riwayat absensi</button><button className="primary-button" onClick={onEdit}><Edit3 size={15} /> Edit karyawan</button></div></div><div className="detail-tabs"><button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button><button className={tab === "history" ? "active" : ""} onClick={onHistory}>Attendance history</button></div><div className="detail-grid"><section className="panel detail-info"><div className="panel-heading"><div><h2>Informasi kerja</h2><p>Snapshot shift dan aktivitas hari ini</p></div><span className="live-label"><i /> Live</span></div><div className="info-grid"><InfoItem label="Outlet" value={store.name} icon={MapPin} /><InfoItem label="Shift ditugaskan" value={`${shift.name} · ${shift.startTime} – ${shift.endTime}`} icon={Clock3} /><InfoItem label="Jam masuk" value={record?.actualCheckInAt ? formatTime(record.actualCheckInAt) : "Belum absen"} icon={Check} />{record?.actualCheckOutAt && <><InfoItem label="Jam pulang" value={formatTime(record.actualCheckOutAt)} icon={ArrowRight} /><InfoItem label="Total jam kerja hari ini" value={formatWorkedMinutes(record.workedMinutes)} icon={Gauge} /></>}<InfoItem label="Status saat ini" value={statusLabel(employee.status)} icon={ShieldCheck} /></div></section><section className="panel stats-panel"><div className="panel-heading"><div><h2>Statistik periode</h2><p>11–25 Juli 2026</p></div><button className="icon-button" onClick={() => onHistory()}><MoreHorizontal size={18} /></button></div><StatLine label="Total terlambat" value={`${employee.totalLate} kali`} tone="yellow" />{employee.totalOvertime > 0 && <><StatLine label="Total lembur dibayar" value={`${employee.totalOvertime} jam`} tone="purple" /><div className="mini-callout"><WalletCards size={16} /><span>Hak lembur periode ini<strong>{formatRupiah(employee.totalOvertime * 10000)}</strong></span></div></>}<StatLine label="Total libur" value={`${employee.totalLeave} hari`} tone="gray" /></section></div><section className="panel detail-history-preview"><div className="panel-heading"><div><h2>Aktivitas absensi terbaru</h2><p>{records.length} record tersimpan di periode berjalan</p></div><button className="text-button" onClick={onHistory}>Lihat semua <ArrowRight size={15} /></button></div>{records.slice(0, 3).map((item) => <div className="history-row" key={item.id}><div className="history-date"><b>{formatDateShort(item.workDate).day}</b><span>{formatDateShort(item.workDate).month}</span></div><div><b>{shift.name}</b><small>{item.punctualityStatus === "LATE" ? `Terlambat ${item.lateMinutes} menit` : item.attendanceStatus === "DAY_OFF" ? "Libur" : item.actualCheckOutAt ? "Hadir tepat waktu" : "Jam masuk tercatat"}</small></div><span className={`status-pill ${item.overtimeEligible ? "overtime" : item.attendanceStatus === "DAY_OFF" ? "off" : item.actualCheckOutAt ? "green" : "working"}`}><span />{item.overtimeEligible ? `${item.paidOvertimeHours}j lembur` : item.attendanceStatus === "DAY_OFF" ? "Libur" : item.actualCheckOutAt ? "Selesai" : "Masuk tercatat"}</span></div>)}</section></> }

function EmployeeDetail({ employee, storeById, shiftById, record, records, onBack, onEdit, onDelete, onHistory }) {
  const shift = shiftById[employee.shiftId] || SHIFTS[0];
  const store = storeById[employee.storeId] || { name: employee.storeName || "Belum ditentukan" };
  const phone = formatWhatsAppPhone(employee.phone || employee.senderJid);
  const workedRecords = records.filter((item) => item.workedMinutes > 0);
  const averageMinutes = workedRecords.length ? Math.round(workedRecords.reduce((sum, item) => sum + item.workedMinutes, 0) / workedRecords.length) : 0;
  const hasCheckedIn = Boolean(record?.actualCheckInAt);
  const hasCheckedOut = Boolean(record?.actualCheckOutAt);
  return <>
    <div className="detail-page-heading">
      <div>
        <button className="back-link detail-back" onClick={onBack}><ArrowLeft size={16} /> Data Karyawan</button>
        <div className="eyebrow">DATA KARYAWAN / DETAIL KARYAWAN</div>
        <h1>Detail Karyawan</h1>
        <p>Informasi lengkap dan aktivitas absensi karyawan.</p>
      </div>
      <div className="detail-actions"><button className="quiet-button" onClick={onBack}>Batal</button><button className="danger-button" onClick={() => { if (window.confirm(`Hapus ${employee.name} dari data karyawan aktif? Riwayat absensi tetap tersimpan.`)) onDelete(); }}>Hapus Data</button><button className="primary-button" onClick={onEdit}><Edit3 size={15} /> Edit Data</button></div>
    </div>
    <section className="panel detail-profile-card">
      <div className={`avatar avatar-large avatar-${employee.accent}`}>{employee.initials}</div>
      <div className="detail-profile-copy"><h2>{employee.name}</h2><div className="detail-phone"><Phone size={14} />{phone}</div><span className={`status-pill ${employee.status}`}><span />{statusLabel(employee.status)}</span></div>
      <span className="detail-profile-role">{employee.role}</span>
    </section>
    <div className="detail-grid detail-screenshot-grid">
      <section className="panel detail-info"><div className="panel-heading"><div><h2>Informasi Karyawan</h2><p>Data kerja dan kehadiran terbaru</p></div><span className="live-label"><i /> Live</span></div><div className="info-grid"><InfoItem label="Outlet" value={store.name} icon={MapPin} /><InfoItem label="Shift Kerja" value={`${shift.name} (${shift.startTime} – ${shift.endTime})`} icon={Clock3} /><InfoItem label="Jam Masuk Hari Ini" value={hasCheckedIn ? formatTime(record.actualCheckInAt) : "Belum absen"} icon={Check} /><InfoItem label="Jam Keluar Hari Ini" value={hasCheckedOut ? formatTime(record.actualCheckOutAt) : "Belum tercatat"} icon={ArrowRight} /><InfoItem label="Total Jam Kerja Hari Ini" value={hasCheckedOut ? formatWorkedMinutes(record.workedMinutes) : hasCheckedIn ? "Sedang berjalan" : "—"} icon={Gauge} /><InfoItem label="Status Kehadiran" value={statusLabel(employee.status)} icon={ShieldCheck} /></div></section>
      <section className="panel stats-panel"><div className="panel-heading"><div><h2>Statistik Karyawan</h2><p>Periode kerja berjalan</p></div></div><StatLine label="Total Terlambat" value={`${employee.totalLate} kali`} tone="yellow" /><StatLine label="Total Lembur" value={`${employee.totalOvertime} jam`} tone="purple" /><StatLine label="Total Libur" value={`${employee.totalLeave} hari`} tone="gray" /><StatLine label="Rata-rata Jam Kerja" value={averageMinutes ? formatWorkedMinutes(averageMinutes) : "—"} tone="blue" /></section>
    </div>
    <section className="panel detail-quick-actions"><div className="panel-heading"><div><h2>Aksi Cepat</h2><p>Buka riwayat aktivitas karyawan.</p></div></div><div className="quick-action-grid"><button className="quick-action-button" onClick={onHistory}><History size={14} /> Riwayat Absensi</button><button className="quick-action-button" onClick={onHistory}><History size={14} /> Riwayat Lembur</button><button className="quick-action-button" onClick={onHistory}><CalendarDays size={14} /> Riwayat Libur</button></div></section>
    <section className="panel detail-history-preview"><div className="panel-heading"><div><h2>Aktivitas absensi terbaru</h2><p>{records.length} record tersimpan untuk karyawan ini</p></div><button className="text-button" onClick={onHistory}>Lihat semua <ArrowRight size={15} /></button></div>{records.slice(0, 3).map((item) => <div className="history-row" key={item.id}><div className="history-date"><b>{formatDateShort(item.workDate).day}</b><span>{formatDateShort(item.workDate).month}</span></div><div><b>{shift.name}</b><small>{item.punctualityStatus === "LATE" ? `Terlambat ${item.lateMinutes} menit` : item.attendanceStatus === "DAY_OFF" ? "Libur" : item.actualCheckOutAt ? "Hadir tepat waktu" : "Jam masuk tercatat"}</small></div><span className={`status-pill ${item.overtimeEligible ? "overtime" : item.attendanceStatus === "DAY_OFF" ? "off" : item.actualCheckOutAt ? "green" : "working"}`}><span />{item.overtimeEligible ? `${item.paidOvertimeHours}j lembur` : item.attendanceStatus === "DAY_OFF" ? "Libur" : item.actualCheckOutAt ? "Selesai" : "Masuk tercatat"}</span></div>)}</section>
  </>;
}

function InfoItem({ label, value, icon: Icon }) { return <div className="info-item"><span><Icon size={15} /></span><div><small>{label}</small><b>{value}</b></div></div>; }
function StatLine({ label, value, tone }) { return <div className="stat-line"><span className={`stat-bullet ${tone}`} /><span>{label}</span><b>{value}</b></div>; }

function SettingsPage({ settings, shifts = SHIFTS, onUpdateSettings, onConnectDrive, onBackupDrive, driveConnected, backupBusy, backupProgress, onNotify }) {
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const toleranceHint = settings.tolerance === 0 ? "Aturan default: terlambat setelah 10 menit" : `Terlambat ${settings.tolerance} menit masih ditoleransi`;
  const saveShift = async (shift) => {
    const result = await onUpdateSettings({ shifts: [...shifts, shift] });
    if (result?.ok) { setShowShiftModal(false); onNotify(`${shift.name} berhasil ditambahkan`); }
  };
  const saveNumber = async (value) => {
    const patch = editing === "overtime" ? { overtimeRate: value } : { tolerance: value };
    const result = await onUpdateSettings(patch);
    if (result?.ok) { onNotify(editing === "overtime" ? "Tarif lembur diperbarui" : "Toleransi terlambat diperbarui"); setEditing(null); }
  };
  return <>
    <PageTitle eyebrow="WORKSPACE / PREFERENCES" title="Pengaturan" description="Atur aturan kerja dan integrasi TimeKeeper." />
    <div className="settings-content settings-card-grid">
      <SettingSection className="setting-card-shift" title="Shift kerja" description="Jadwal shift yang aktif dan digunakan dalam perhitungan absensi.">
        <div className="shift-settings">{shifts.map((shift, index) => <div className="shift-setting" key={shift.id}><span className="shift-badge">{String(index + 1).padStart(2, "0")}</span><div><b>{shift.name}</b><small>{shift.startTime} – {shift.endTime}{shift.crossesMidnight ? " · hari berikutnya" : ""}</small></div><span className="scheduled-hours">{shift.scheduledMinutes / 60} jam</span></div>)}</div>
        <button className="text-button add-setting" onClick={() => setShowShiftModal(true)}><Plus size={15} /> Tambah shift</button>
      </SettingSection>
      <SettingSection className="setting-card-hours" title="Jam kerja" description="Acuan tipe lembur dan jadwal normal tim."><SettingRow icon={Clock3} label="Jam kerja normal" hint="Durasi kerja standar" value="10 jam" /></SettingSection>
      <SettingSection className="setting-card-backup" title="Backup" description="Hubungkan akun Google Drive secara manual."><div className="settings-summary-card backup-settings-card"><span className="settings-summary-icon"><Cloud size={18} /></span><div><b>Google Drive</b><small>{driveConnected ? "Google Drive tersambung. Backup dibuat hanya saat tombol ditekan." : "Kamu yang menyetujui koneksi. Belum ada file yang diunggah otomatis."}</small></div><button className="primary-button" onClick={driveConnected ? onBackupDrive : onConnectDrive} disabled={backupBusy}>{backupBusy ? <LoaderCircle className="spin" size={15} /> : <Cloud size={15} />} {backupBusy ? (driveConnected ? "Backup berjalan..." : "Menghubungkan...") : (driveConnected ? "Backup sekarang" : "Hubungkan Google Drive")}</button></div>{backupBusy && driveConnected && <div className="backup-progress" aria-live="polite"><div className="backup-progress-track"><span style={{ width: `${backupProgress}%` }} /></div><b>{backupProgress}%</b><small>Membuat dan mengunggah file Excel rekap...</small></div>}</SettingSection>
      <SettingSection className="setting-card-overtime" title="Lembur" description="Aturan pembayaran lembur yang digunakan aplikasi."><SettingRow icon={WalletCards} label="Tarif lembur per jam" hint="Nominal rupiah, awalan Rp dikunci" value={formatRupiah(settings.overtimeRate)} editable onEdit={() => setEditing("overtime")} /></SettingSection>
      <SettingSection className="setting-card-tolerance" title="Toleransi terlambat" description="Batas waktu sebelum status terlambat dihitung."><SettingRow icon={SlidersHorizontal} label="Toleransi masuk" hint={toleranceHint} value={`${settings.tolerance} menit`} editable onEdit={() => setEditing("tolerance")} /></SettingSection>
      <WhatsAppBotCard className="setting-card-whatsapp" onNotify={onNotify} />
    </div>
    {showShiftModal && <AddShiftModal onClose={() => setShowShiftModal(false)} onSave={saveShift} nextNumber={shifts.length + 1} />}
    {editing && <NumberSettingModal type={editing} value={editing === "overtime" ? settings.overtimeRate : settings.tolerance} onClose={() => setEditing(null)} onSave={saveNumber} />}
  </>;
}
function AddShiftModal({ onClose, onSave, nextNumber }) {
  const [name, setName] = useState(`Shift ${nextNumber}`);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");
  const [warning, setWarning] = useState("");
  const submit = () => {
    if (!name.trim()) return setWarning("Nama shift wajib diisi.");
    if (startTime === endTime) return setWarning("Jam mulai dan jam selesai tidak boleh sama.");
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const rawEndMinutes = endHour * 60 + endMinute;
    const scheduledMinutes = rawEndMinutes > startMinutes ? rawEndMinutes - startMinutes : (1440 - startMinutes) + rawEndMinutes;
    onSave({ id: `shift-${Date.now()}`, code: `SHIFT_${nextNumber}`, name: name.trim(), startTime, endTime, crossesMidnight: rawEndMinutes <= startMinutes, scheduledMinutes });
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><div className="eyebrow">PREFERENCES / SHIFT KERJA</div><h2>Tambah shift</h2><p>Atur jam mulai dan jam selesai shift baru.</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>{warning && <div className="modal-warning"><Info size={16} /><span>{warning}</span></div>}<label>Nama shift<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label><div className="time-input-grid"><label>Mulai<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label>Selesai<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div><div className="audit-note"><Clock3 size={16} /><span>Jika jam selesai lebih kecil dari jam mulai, shift dianggap melewati tengah malam.</span></div><div className="modal-actions"><button className="quiet-button" onClick={onClose}>Batal</button><button className="primary-button" onClick={submit}><Check size={16} /> Simpan shift</button></div></div></div>;
}

function NumberSettingModal({ type, value, onClose, onSave }) {
  const [input, setInput] = useState(String(value ?? 0));
  const isOvertime = type === "overtime";
  const submit = () => {
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    onSave(Math.floor(parsed));
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><div className="eyebrow">PREFERENCES / {isOvertime ? "LEMBUR" : "KETERLAMBATAN"}</div><h2>{isOvertime ? "Ubah tarif lembur" : "Ubah toleransi masuk"}</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><label>{isOvertime ? "Nominal per jam" : "Toleransi dalam menit"}<div className="number-input-wrap">{isOvertime && <span>Rp</span>}<input type="number" min="0" step="1" value={input} onChange={(event) => setInput(event.target.value)} autoFocus />{!isOvertime && <span>menit</span>}</div></label><div className="audit-note"><Info size={16} /><span>{isOvertime ? "Awalan Rp dikunci oleh sistem; masukkan angka nominal saja." : "Nilai 0 memakai aturan default: terlambat setelah 10 menit. Nilai lain menjadi batas toleransi langsung."}</span></div><div className="modal-actions"><button className="quiet-button" onClick={onClose}>Batal</button><button className="primary-button" disabled={!input.trim()} onClick={submit}><Check size={16} /> Simpan perubahan</button></div></div></div>;
}

function WhatsAppBotCard({ onNotify, className = "" }) {
  const [status, setStatus] = useState({ state: isWaBotConfigured ? "disconnected" : "unconfigured", isConnected: false, hasQr: false, qrDataUrl: null, lastError: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isWaBotConfigured) return undefined;
    let active = true;
    const load = async () => {
      try {
        const next = await waBotApi.getStatus();
        if (active) setStatus(next);
      } catch (error) {
        if (active) setStatus((current) => ({ ...current, state: "error", lastError: error.message }));
      }
    };
    load();
    const timer = window.setInterval(load, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const connect = async () => {
    if (!isWaBotConfigured) return onNotify("Backend WhatsApp Bot belum dikonfigurasi. Isi VITE_TIMEKEEPER_WA_API_URL terlebih dahulu.");
    setBusy(true);
    try { setStatus(await waBotApi.connect()); onNotify("Bot sedang menyiapkan koneksi dan QR terbaru"); }
    catch (error) { setStatus((current) => ({ ...current, state: "error", lastError: error.message })); onNotify("Bot belum bisa dihubungkan"); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    try { setStatus(await waBotApi.disconnect()); onNotify("Koneksi WhatsApp Bot diputuskan"); }
    catch (error) { onNotify(error.message); }
    finally { setBusy(false); }
  };

  const connected = status.isConnected || status.state === "connected";
  const label = connected ? "Connected" : status.state === "qr" ? "Scan QR" : status.state === "connecting" ? "Connecting" : status.state === "error" ? "Error" : status.state === "unconfigured" ? "Belum disiapkan" : "Disconnected";
  const pillTone = connected ? "green" : status.state === "error" ? "late" : "off";
  return <section className={"panel wa-bot-card " + className}>
    <div className="wa-bot-heading"><div className="wa-bot-brand"><span className="wa-bot-logo"><Phone size={21} /></span><div><h2>WhatsApp Bot (TimeKeeper)</h2><p>Input absensi langsung dari WhatsApp admin.</p></div></div><span className={"status-pill " + pillTone + " wa-bot-status"}><span />{label}</span></div>
    <div className={"wa-bot-stage " + (connected ? "connected" : "")}>
      {connected ? <><div className="wa-connected-mark"><Check size={40} /></div><strong>Connected</strong><small>Bot siap menerima laporan via WhatsApp.</small></> : status.qrDataUrl ? <><img className="wa-qr-image" src={status.qrDataUrl} alt="QR WhatsApp TimeKeeper" /><strong>Scan QR dari WhatsApp</strong><small>QR akan berganti otomatis saat WhatsApp menerbitkan QR baru.</small></> : <><div className="wa-qr-empty"><QrCode size={38} /></div><strong>{isWaBotConfigured ? "QR belum tersedia" : "Backend bot belum terhubung"}</strong><small>{status.lastError || "Jalankan service WA bot dan isi URL API di environment web."}</small></>}
    </div>
    <div className="wa-bot-actions"><button className="primary-button" onClick={connect} disabled={busy || connected}>{busy ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}{connected ? "Terhubung" : status.qrDataUrl ? "Perbarui QR" : "Hubungkan bot"}</button>{connected && <button className="quiet-button" onClick={disconnect} disabled={busy}><Wifi size={15} /> Putuskan</button>}</div>
    <div className="wa-bot-note"><span><b>Format pesan:</b> outlet · karyawan · tanggal dan jam kerja</span><code>27 Juli 7 pagi / 7 malam</code></div>
  </section>;
}
function SettingSection({ title, description, children, className = "" }) { return <section className={"panel setting-section " + className}><div className="setting-heading"><h2>{title}</h2><p>{description}</p></div>{children}</section>; }
function SettingRow({ icon: Icon, label, hint, value, editable, onEdit, onClick }) { return <div className={`setting-row ${onClick || editable ? "setting-row-interactive" : ""}`} onClick={onClick}><span className="setting-row-icon"><Icon size={17} /></span><div><b>{label}</b><small>{hint}</small></div><strong>{value}</strong>{editable && <button className="icon-button" onClick={(event) => { event.stopPropagation(); onEdit(); }}><Pencil size={15} /></button>}{(onClick || editable) && <ChevronRight size={16} className="setting-chevron" />}</div>; }

function ProfilePage({ profile, onBack, onSave, onUploadPhoto, onLogout }) {
  const [name, setName] = useState(profile.name || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setName(profile.name || "");
    setPhone(profile.phone || "");
  }, [profile.name, profile.phone]);
  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    const result = await onSave({ name, phone });
    setSaving(false);
    if (!result?.ok) setMessage(result?.message || "Profil belum berhasil disimpan.");
  };
  const handlePhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    const result = await onUploadPhoto(file);
    if (!result?.ok) setMessage(result?.message || "Foto belum berhasil diupload.");
    event.target.value = "";
  };
  return <div className="profile-page"><div className="profile-page-heading"><div><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Dashboard</button><div className="eyebrow">ACCOUNT / PROFILE</div><h1>Profil</h1><p>Kelola identitas dan nomor WhatsApp akun TimeKeeper.</p></div></div><section className="panel profile-card"><div className="profile-photo-column"><div className={`profile-photo ${profile.photoURL ? "has-photo" : ""}`} style={profile.photoURL ? { backgroundImage: `url(${profile.photoURL})` } : undefined}>{!profile.photoURL && (profile.name || "Admin").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div><label className="upload-photo-button"><Upload size={15} /> Upload Foto<input type="file" accept="image/*" onChange={handlePhoto} /></label><small>JPG, PNG maksimal 5 MB.</small></div><div className="profile-form"><label>Nama<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama pengguna" /></label><label>Email<input value={profile.email} readOnly disabled /></label><label>Nomor WhatsApp<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Contoh: 628123456789" /></label>{message && <div className="modal-warning"><Info size={16} /><span>{message}</span></div>}<div className="profile-form-actions"><button className="quiet-button" onClick={onLogout}>Keluar</button><button className="primary-button" disabled={!name.trim() || saving} onClick={handleSave}>{saving ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} {saving ? "Menyimpan..." : "Simpan Profil"}</button></div></div></section></div>;
}

function AboutPage({ timeZoneLabel }) {
  const [dialog, setDialog] = useState(null);
  return <>
    <div className="about-page">
      <div className="about-mark"><Logo /></div>
      <div className="eyebrow">ABOUT TIMEKEEPER</div>
      <h1>Every Hour Counts.</h1>
      <p className="about-lede">TimeKeeper membantu tim bekerja dengan ritme yang lebih jelas, adil, dan manusiawi.</p>
      <div className="about-details panel">
        <div><small>Versi</small><b>{APP_VERSION}</b></div>
        <div><small>Developer</small><b>i729 Tambayong</b></div>
        <div><small>Timezone</small><b>{timeZoneLabel}</b></div>
        <div><small>Data</small><b>Firebase</b></div>
      </div>
      <div className="about-links">
        <button onClick={() => setDialog("privacy")}>Privacy <ArrowRight size={15} /></button>
        <button onClick={() => setDialog("terms")}>Terms <ArrowRight size={15} /></button>
        <button onClick={() => setDialog("contact")}>Contact <ArrowRight size={15} /></button>
      </div>
      <p className="copyright">© 2026 TimeKeeper. Built for teams that care about every hour.</p>
    </div>
    {dialog === "privacy" && <InfoModal eyebrow="PRIVACY" title="Privacy TimeKeeper" onClose={() => setDialog(null)}>
      <p>TimeKeeper memproses data seperlunya untuk menjalankan absensi dan rekap kerja.</p>
      <h3>Data yang digunakan</h3>
      <ul><li>Profil akun Google untuk autentikasi dan identitas admin.</li><li>Data outlet, karyawan, jadwal, dan absensi yang disimpan di Firebase Firestore.</li><li>Metadata pesan WhatsApp dan nomor pengirim yang diperlukan untuk validasi bot dan audit.</li></ul>
      <h3>Penggunaan dan akses</h3>
      <p>Data digunakan untuk menghitung jam kerja, keterlambatan, lembur, periode rekap, dan laporan operasional. Data tidak dijual atau dipublikasikan. Akses dibatasi untuk akun yang diizinkan dan layanan backend TimeKeeper.</p>
      <h3>Penyimpanan</h3>
      <p>Data disimpan pada layanan Firebase/Google Cloud yang dikonfigurasi untuk project TimeKeeper. Sesi WhatsApp bot disimpan terpisah pada Cloud Storage project ini.</p>
      <p className="modal-note">Dengan menggunakan TimeKeeper, kamu menyetujui pemrosesan data sesuai kebutuhan operasional aplikasi ini.</p>
    </InfoModal>}
    {dialog === "terms" && <InfoModal eyebrow="TERMS" title="Ketentuan penggunaan" onClose={() => setDialog(null)}>
      <p>TimeKeeper digunakan untuk membantu pencatatan jam kerja internal dan pengelolaan absensi tim.</p>
      <h3>Ketentuan utama</h3>
      <ul><li>Gunakan akun Google dan nomor WhatsApp yang memang berwenang.</li><li>Pastikan nama outlet, karyawan, tanggal, dan jam kerja yang dikirim benar.</li><li>Admin bertanggung jawab memeriksa koreksi, status libur, dan pembayaran lembur tunai.</li><li>Dilarang menyalahgunakan bot, mengirim data palsu, atau mencoba mengakses data akun lain.</li></ul>
      <h3>Batasan</h3>
      <p>TimeKeeper membantu pencatatan dan perhitungan, tetapi keputusan operasional, koreksi manual, serta pembayaran tetap menjadi tanggung jawab admin. Layanan dapat mengalami gangguan saat Firebase, WhatsApp, atau koneksi internet bermasalah.</p>
      <p className="modal-note">Ketentuan ini dapat diperbarui ketika TimeKeeper mulai digunakan lebih luas.</p>
    </InfoModal>}
    {dialog === "contact" && <InfoModal eyebrow="DEVELOPER" title="i729 Tambayong" onClose={() => setDialog(null)}>
      <p>i729 adalah developer aplikasi ini. Ia seorang product builder yang merancang dan mengembangkan solusi digital untuk membantu pekerjaan operasional menjadi lebih rapi, terukur, dan mudah digunakan.</p>
      <p>Dalam membangun TimeKeeper, i729 menerjemahkan kebutuhan kerja nyata menjadi fitur yang konkret—mulai dari pencatatan absensi, perhitungan jam kerja dan lembur, klasifikasi outlet, hingga rekap data yang tersimpan di Firebase.</p>
      <p>Ia dikenal teliti terhadap detail dan berorientasi pada kualitas. Keamanan akses, ketepatan waktu, kestabilan WhatsApp Bot, integrasi Google, serta pengalaman pengguna menjadi bagian penting dalam setiap pengembangan aplikasi ini.</p>
      <p>TimeKeeper dikembangkan untuk mendukung operasional tim sekaligus menjadi sistem absensi yang dapat digunakan secara praktis oleh pengguna di lapangan.</p>
      <p className="modal-note">i729 percaya bahwa aplikasi yang baik bukan hanya terlihat modern, tetapi juga harus dapat diandalkan, mudah dipahami, dan benar-benar membantu pekerjaan sehari-hari.</p>
    </InfoModal>}
  </>;
}

function InfoModal({ eyebrow, title, children, onClose }) { return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal info-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="info-modal-body">{children}</div><div className="modal-actions"><button className="primary-button" onClick={onClose}>Tutup</button></div></div></div>; }

function EditEmployee({ employee, outlets, onClose, onSave }) { const [name, setName] = useState(employee.name); const [phone, setPhone] = useState(employee.phone); const [role, setRole] = useState(employee.role || "Karyawan"); const [storeId, setStoreId] = useState(employee.storeId || ""); const [shiftId, setShiftId] = useState(employee.shiftId || "shift-1"); return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="modal-heading"><div><div className="eyebrow">EDIT EMPLOYEE</div><h2>Perbarui karyawan</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><label>Nama lengkap<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>Nomor WhatsApp<input value={phone} onChange={(e) => setPhone(e.target.value)} /></label><label>Jabatan<input value={role} onChange={(e) => setRole(e.target.value)} /></label><label>Shift<select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>{SHIFTS.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} · {shift.startTime} – {shift.endTime}</option>)}</select></label><label>Outlet<select value={storeId} onChange={(e) => setStoreId(e.target.value)}><option value="">Belum ditentukan</option>{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select></label><div className="audit-note"><ShieldCheck size={16} /><span>Perubahan ini tersimpan ke Firestore bersama timestamp admin.</span></div><div className="modal-actions"><button className="quiet-button" onClick={onClose}>Batal</button><button className="primary-button" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), phone: phone.trim(), role: role.trim(), shiftId, storeId })}><Check size={16} /> Simpan perubahan</button></div></div></div>; }

function EmployeeFormModal({ outlets, onClose, onSave }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("Karyawan");
  const [storeId, setStoreId] = useState("");
  const [shiftId, setShiftId] = useState("shift-1");
  const [warning, setWarning] = useState("");
  const submit = async () => {
    if (!name.trim()) return setWarning("Nama karyawan wajib diisi.");
    setWarning("");
    const result = await onSave({ name, phone, role, storeId, shiftId });
    if (!result?.ok) setWarning(result?.message || "Data karyawan belum dapat disimpan.");
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><div className="eyebrow">TIM / TAMBAH KARYAWAN</div><h2>Tambah Karyawan</h2><p>Tambahkan data karyawan langsung dari web.</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>{warning && <div className="modal-warning"><Info size={16} /><span>{warning}</span></div>}<label>Nama lengkap<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: Budi Santoso" /></label><label>Nomor WhatsApp<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Contoh: 628123456789" /></label><label>Jabatan<input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Karyawan" /></label><label>Shift<select value={shiftId} onChange={(event) => setShiftId(event.target.value)}>{SHIFTS.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} · {shift.startTime} – {shift.endTime}</option>)}</select></label><label>Outlet<select value={storeId} onChange={(event) => setStoreId(event.target.value)}><option value="">Belum ditentukan</option>{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select></label><div className="audit-note"><ShieldCheck size={16} /><span>Data baru akan langsung tersimpan ke Firebase dan dapat diedit kembali.</span></div><div className="modal-actions"><button className="quiet-button" onClick={onClose}>Batal</button><button className="primary-button" onClick={submit}><Check size={16} /> Simpan karyawan</button></div></div></div>;
}

function OutletFormModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState("Selatan");
  const [area, setArea] = useState("");
  const [warning, setWarning] = useState("");
  const submit = async () => {
    if (!name.trim()) return setWarning("Nama outlet wajib diisi.");
    setWarning("");
    const result = await onSave({ name, region, area });
    if (!result?.ok) setWarning(result?.message || "Data outlet belum dapat disimpan.");
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><div className="eyebrow">OPERATIONS / TAMBAH OUTLET</div><h2>Tambah Outlet</h2><p>Tambahkan outlet baru ke wilayah operasional.</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>{warning && <div className="modal-warning"><Info size={16} /><span>{warning}</span></div>}<label>Nama outlet<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: Cuci Dewe" /></label><label>Wilayah<select value={region} onChange={(event) => setRegion(event.target.value)}><option>Selatan</option><option>Utara</option><option>Barat</option></select></label><label>Keterangan wilayah<input value={area} onChange={(event) => setArea(event.target.value)} placeholder="Contoh: Denpasar Selatan" /></label><div className="audit-note"><ShieldCheck size={16} /><span>Jam operasional outlet baru otomatis ditetapkan 24 Jam.</span></div><div className="modal-actions"><button className="quiet-button" onClick={onClose}>Batal</button><button className="primary-button" onClick={submit}><Check size={16} /> Simpan outlet</button></div></div></div>;
}

function EditOutlet({ outlet, onClose, onSave }) {
  const [name, setName] = useState(outlet.name);
  const [region, setRegion] = useState(outlet.region || "Selatan");
  const [area, setArea] = useState(outlet.area || outlet.region || "");
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><div className="eyebrow">EDIT OUTLET</div><h2>Perbarui outlet</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><label>Nama outlet<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Wilayah<select value={region} onChange={(event) => setRegion(event.target.value)}><option>Selatan</option><option>Utara</option><option>Barat</option></select></label><label>Keterangan wilayah<input value={area} onChange={(event) => setArea(event.target.value)} placeholder="Contoh: Denpasar Selatan" /></label><div className="audit-note"><ShieldCheck size={16} /><span>Jam operasional outlet tetap 24 Jam. Perubahan disimpan ke Firebase.</span></div><div className="modal-actions"><button className="quiet-button" onClick={onClose}>Batal</button><button className="primary-button" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), region, area: area.trim() })}><Check size={16} /> Simpan outlet</button></div></div></div>;
}

function AddEmployeeToOutlet({ employees, storeById, outlet, onClose, onAssign }) {
  const [search, setSearch] = useState("");
  const [warning, setWarning] = useState("");
  const members = employees.filter((employee) => employee.storeId === outlet.id);
  const candidates = employees.filter((employee) => !members.some((member) => member.id === employee.id) && employee.name.toLowerCase().includes(search.toLowerCase()));
  const chooseEmployee = async (employee) => {
    setWarning("");
    const result = await onAssign(employee);
    if (result?.ok) onClose();
    else setWarning(result?.message || "Karyawan belum dapat ditambahkan.");
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal add-employee-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><div className="eyebrow">OUTLET / TAMBAH KARYAWAN</div><h2>Tambah karyawan</h2><p>Pilih karyawan untuk {outlet.name}.</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="search-box modal-search"><Search size={16} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama karyawan..." /></div>{warning && <div className="modal-warning"><Info size={16} /><span>{warning}</span></div>}<div className="employee-picker-list">{candidates.length ? candidates.map((employee) => <button className="employee-picker-row" key={employee.id} onClick={() => chooseEmployee(employee)}><span className={`avatar avatar-small avatar-${employee.accent}`}>{employee.initials}</span><span><b>{employee.name}</b><small>{employee.storeId ? `Terdaftar di ${storeById[employee.storeId]?.name || employee.storeName || "outlet lain"}` : "Belum terdaftar di outlet"}</small></span><ChevronRight size={16} /></button>) : <div className="empty-state">Karyawan tidak ditemukan.</div>}</div><div className="modal-actions"><button className="quiet-button" onClick={onClose}>Tutup</button></div></div></div>;
}

function HistoryDrawer({ employee, records, onClose }) { return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="history-drawer" onMouseDown={(e) => e.stopPropagation()}><div className="drawer-heading"><div><div className="eyebrow">ATTENDANCE HISTORY</div><h2>{employee.name}</h2><p>Periode 11–25 Juli 2026</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="drawer-summary"><div><b>{employee.totalLate}</b><span>keterlambatan</span></div>{employee.totalOvertime > 0 && <div><b>{employee.totalOvertime}j</b><span>lembur</span></div>}<div><b>{employee.totalLeave}</b><span>libur</span></div></div><div className="drawer-records">{records.length ? records.map((record) => <div className="drawer-record" key={record.id}><div className="history-date"><b>{formatDateShort(record.workDate).day}</b><span>{formatDateShort(record.workDate).month}</span></div><div className="drawer-record-copy"><b>{record.attendanceStatus === "DAY_OFF" ? "Hari libur" : record.punctualityStatus === "LATE" ? `Terlambat ${record.lateMinutes} menit` : record.actualCheckOutAt ? "Hadir tepat waktu" : "Jam masuk tercatat"}</b><small>{record.actualCheckInAt ? `Masuk ${formatTime(record.actualCheckInAt)}${record.actualCheckOutAt ? ` – Pulang ${formatTime(record.actualCheckOutAt)}` : ""}` : "Tidak ada jam kerja"}</small></div><span className={`status-pill ${record.overtimeEligible ? "overtime" : record.attendanceStatus === "DAY_OFF" ? "off" : record.actualCheckOutAt ? "green" : "working"}`}><span />{record.overtimeEligible ? `${record.paidOvertimeHours}j` : record.attendanceStatus === "DAY_OFF" ? "Libur" : record.actualCheckOutAt ? "Selesai" : "Masuk tercatat"}</span></div>) : <div className="empty-state">Belum ada riwayat absensi.</div>}</div><button className="primary-button drawer-export"><ArrowRight size={16} /> Export riwayat</button></aside></div>; }

function statusLabel(status) { return ({ present: "Hadir", late: "Terlambat", overtime: "Lembur", working: "Sedang bekerja", absent: "Belum absen" }[status] || status); }
function formatWhatsAppPhone(value) {
  const raw = String(value || "").replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
  if (!raw) return "—";
  const normalized = raw.startsWith("0") ? `62${raw.slice(1)}` : raw;
  return `+${normalized}`;
}
function makeDocumentId(value) {
  const slug = String(value || "data").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "data";
  return `${slug}-${Date.now().toString(36)}`;
}
function getTimeGreeting(date = new Date(), timeZone = getBrowserTimeZone()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone }).format(date));
  if (hour < 4 || hour >= 18) return "malam";
  if (hour >= 4 && hour < 11) return "pagi";
  if (hour < 15) return "siang";
  return "sore";
}
function formatTodayLabel(date = new Date(), timeZone = getBrowserTimeZone()) { return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone }).format(date); }
function formatMonthYear(date = new Date(), timeZone = getBrowserTimeZone()) { return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone }).format(date).toUpperCase(); }
function formatTime(date, timeZone = getBrowserTimeZone()) { return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(date); }
function formatTimeZoneLabel(timeZone = getBrowserTimeZone()) { const offset = new Intl.DateTimeFormat("id-ID", { timeZone, timeZoneName: "longOffset" }).formatToParts(new Date()).find((part) => part.type === "timeZoneName")?.value || "GMT+08:00"; return `${timeZone} (${offset.replace("GMT", "UTC")})`; }
function getAttendancePeriodLabel(isoDate) { const day = Number(String(isoDate || "").split("-")[2]); return day >= 11 && day <= 25 ? "11-25" : "26-10"; }
function shiftByIdValue(shiftId) { return SHIFTS.find((shift) => shift.id === shiftId) || SHIFTS[0]; }
function buildDashboardDayStats(day, records, totalEmployees) {
  const dayRecords = records.filter((record) => record.workDate === day);
  const presentIds = new Set(dayRecords.filter((record) => record.actualCheckInAt && record.attendanceStatus !== "DAY_OFF").map((record) => record.employeeId));
  const lateIds = new Set(dayRecords.filter((record) => record.punctualityStatus === "LATE").map((record) => record.employeeId));
  const overtimeMinutes = dayRecords.reduce((sum, record) => sum + (record.extraMinutes || record.paidOvertimeHours * 60 || 0), 0);
  return { present: presentIds.size, late: lateIds.size, absent: Math.max(0, totalEmployees - presentIds.size), overtimeMinutes };
}
function calculateDashboardTrend(current, previous, goodDirection) {
  if (!previous || previous <= 0 || current === previous) return { label: "—", tone: "neutral", direction: null };
  const change = ((current - previous) / previous) * 100;
  const improving = goodDirection === "increase" ? change > 0 : change < 0;
  return { label: `${change > 0 ? "+" : ""}${change.toFixed(1)}%`, tone: improving ? "good" : "bad", direction: change > 0 ? "up" : "down" };
}
function getPeriodRange(isoDate) {
  const [year, month, day] = String(isoDate || "").split("-").map(Number);
  if (!year || !month || !day) return { startDate: isoDate, endDate: isoDate };
  if (day >= 11 && day <= 25) return { startDate: `${year}-${String(month).padStart(2, "0")}-11`, endDate: `${year}-${String(month).padStart(2, "0")}-25` };
  if (day >= 26) return { startDate: `${year}-${String(month).padStart(2, "0")}-26`, endDate: toIsoDate(new Date(Date.UTC(year, month, 10))) };
  return { startDate: toIsoDate(new Date(Date.UTC(year, month - 2, 26))), endDate: `${year}-${String(month).padStart(2, "0")}-10` };
}
function toIsoDate(date) { return date.toISOString().slice(0, 10); }
function getPreviousIsoDate(isoDate) { const date = new Date(`${isoDate}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 1); return toIsoDate(date); }
function daysBetween(startDate, endDate) { const start = new Date(`${startDate}T12:00:00Z`); const end = new Date(`${endDate}T12:00:00Z`); return Math.round((end - start) / 86400000) + 1; }
function formatPeriodDate(date, timeZone = getBrowserTimeZone()) { return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(`${date}T12:00:00Z`)).replace(/\./g, ""); }
function formatReadableMinutes(minutes) { const value = Math.max(0, Number(minutes) || 0); return `${Math.floor(value / 60)} jam ${String(value % 60).padStart(2, "0")} menit`; }
function formatDateShort(date) { const value = new Date(`${date}T12:00:00+08:00`); return { day: value.getUTCDate().toString().padStart(2, "0"), month: new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Makassar" }).format(value).replace(".", "") }; }

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[TimeKeeper Runtime Error]", error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <div className="auth-shell"><div className="setup-card"><div className="auth-brand"><span className="auth-mark">!</span><span>Time<span>Keeper</span></span></div><div className="auth-eyebrow">RUNTIME ERROR</div><h1>Halaman gagal dimuat.</h1><p className="auth-copy">Aplikasi menangkap error saat dijalankan. Muat ulang halaman atau kirim pesan error ini untuk diperbaiki.</p><div className="runtime-error"><code>{this.state.error.message || "Unknown error"}</code></div><button className="primary-button runtime-reload" onClick={() => window.location.reload()}><ArrowRight size={16} /> Muat ulang aplikasi</button><small className="auth-version">{APP_VERSION}</small></div></div>;
  }
}

createRoot(document.getElementById("root")).render(<AppErrorBoundary><AuthGate><App /></AuthGate></AppErrorBoundary>);
