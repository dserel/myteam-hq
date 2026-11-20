# CHANGELOG (app)

Το πλήρες ιστορικό του έργου μέχρι 24/09/2026 είναι στο Project «FederationsApp» (federations-mvp/docs/CHANGELOG.md).

### 2026-11-20 — Ταυτότητα myTeam HQ + ο κώδικας στο GitHub
- **Ο κώδικας της εφαρμογής ανακτήθηκε** από το συμπιεσμένο αρχείο πηγής του deploy στο Netlify (24/09, `app/` μόνο — όχι `supabase/`). Κάνει build και βγάζει byte-προς-byte το ίδιο bundle με το live, άρα είναι η σωστή έκδοση. Από εδώ και πέρα ζει στο **github.com/dserel/myteam-hq** (ιδιωτικό, branch `main`, με ιστορικό: εισαγωγή → branding). Οι migrations/seed/tests της βάσης δεν ήταν στο zip· η βάση ζει στο Supabase cloud.
- **Όνομα προϊόντος: myTeam HQ** (D-070). Design system: https://claude.ai/artifact/GKwdVMaWTszMh7NkbiHjwF.
- **Εφαρμογή**: Poppins σε όλη την εφαρμογή· tokens navy `#131429` / mint `#04e0b5` (από το επίσημο logo myTeam) / gold `#f4b63f` (badge HQ) στο `src/index.css`· logo στην πλαϊνή μπάρα και στην κεφαλίδα κινητού, favicon = app icon, τίτλος καρτέλας «myTeam HQ».
- **Νέα οθόνη εισόδου**: navy πάνελ με logo και σύνθημα «Όλο το άθλημα, σε μία έδρα.», φόρμα δεξιά, demo λογαριασμοί ομαδοποιημένοι ανά ομοσπονδία (προστέθηκε η Ε.Ο.Α.Ο.Γ. και ενημερώθηκαν τα ονόματα της Ε.Φ.Ε.Ο.Ζ-Ζ.).
- **Κουμπί «official» σε gold** για πράξεις με θεσμικό βάρος: έκδοση δελτίου (μία/μαζικά), έγκριση μεταγραφής.
- **Δελτίο αθλητή (εκτύπωση/PDF)**: navy ταινία με τον εκδότη, ετικέτα «Δελτίο αθλητή» σε gold, «Powered by myTeam HQ» στο κάτω μέρος.
- **Δημόσιες σελίδες & επαλήθευση δελτίου**: «Powered by myTeam HQ» με εικονίδιο· εικόνα κοινοποίησης βαθμολογίας στα νέα χρώματα.
- **Έλεγχος**: build OK, browser στο τοπικό preview και στο live (login, επισκόπηση, ουρά δελτίων, δελτίο, επαλήθευση, δημόσια σελίδα, κινητό) — 0 σφάλματα κονσόλας. Netlify deploy `6b0068794f03c952ecf8db5f` (build στο Netlify από τον κώδικα).
