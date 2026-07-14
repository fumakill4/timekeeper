# TimeKeeper --- Mobile Web App Navigation & UX Specification

## Philosophy

TimeKeeper is a focused work-hours tracking application.

The navigation should remain minimal, fast, and easy to understand.

Design references: - Apple - Linear - Notion - Stripe

------------------------------------------------------------------------

# Main Navigation

    Dashboard
    Data Karyawan
    Outlet
    Pengaturan
    About

Only five main menus are used.

------------------------------------------------------------------------

# 1. Dashboard

Dashboard is a summary page only.

It does not contain CRUD features.

## Sections

-   Periode Berjalan
-   Ringkasan Hari Ini
-   Hadir Hari Ini
-   Belum Absen
-   Terlambat
-   Sedang Lembur
-   Aktivitas Terbaru

Each summary card opens its corresponding detail page.

Example:

    Terlambat (5)
    ↓
    Daftar Karyawan Terlambat

------------------------------------------------------------------------

# 2. Data Karyawan

## Employee List

Each row displays:

-   Photo
-   Employee Name
-   Shift
-   Assigned Outlet
-   Status
-   Chevron ( \> )

Selecting a row opens the employee profile.

------------------------------------------------------------------------

## Employee Detail

### Editable Information

-   Profile Photo
-   Full Name
-   WhatsApp Number

### Work Information

-   Assigned Outlet
-   Shift
-   Check-in Time
-   Check-out Time
-   Total Working Hours Today
-   Current Status

### Statistics

-   Total Late
-   Total Overtime
-   Total Leave

### Actions

-   Edit Employee
-   Attendance History

Attendance History is accessed from inside the employee profile.

------------------------------------------------------------------------

# 3. Outlet

Displays every outlet.

Example:

    Laundry Renon
    Denpasar Timur
    >

    Laundry Panjer
    Denpasar Selatan
    >

Selecting an outlet opens the employee list for that outlet.

Example:

    Laundry Renon

    Budi Santoso
    Shift 1
    Present
    >

    Siti Aminah
    Shift 2
    Late
    >

Selecting an employee opens the same Employee Detail page used in Data
Karyawan.

No duplicated screens.

------------------------------------------------------------------------

# 4. Pengaturan

Settings are grouped like Apple's Settings app.

## Sections

-   Shift Kerja
-   Jam Kerja
-   Toleransi Terlambat
-   Lembur
-   WhatsApp Bot
-   Backup
-   Administrator

------------------------------------------------------------------------

# 5. About

Contains only application information.

-   Logo
-   TimeKeeper
-   Version
-   Developer
-   Firebase® Information
-   Privacy
-   Terms
-   Website
-   Contact

------------------------------------------------------------------------

# Navigation Flow

    Dashboard
        ↓
    Detail

    Data Karyawan
        ↓
    Employee Detail
        ↓
    Edit / Attendance History

    Outlet
        ↓
    Employee List
        ↓
    Employee Detail

Employee Detail is the single source of truth.

Both Data Karyawan and Outlet always open the same Employee Detail page.

This minimizes duplicated UI and development effort.

------------------------------------------------------------------------

# UX Principles

-   Mobile-first
-   Minimal navigation
-   Maximum three taps to reach any feature
-   Consistent page hierarchy
-   One employee detail page shared by all modules
-   Clean Apple-inspired interface
-   Large touch targets
-   Rounded cards
-   Simple typography
-   White space first
