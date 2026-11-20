import { format, parseISO, differenceInYears, differenceInDays } from 'date-fns'

export const money = (n: number | string | null | undefined) =>
  new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(Number(n ?? 0))

export const fmtDate = (d: string | null | undefined) => (d ? format(parseISO(d), 'dd/MM/yyyy') : '—')
export const fmtDateTime = (d: string | null | undefined) => (d ? format(parseISO(d), 'dd/MM/yyyy HH:mm') : '—')
export const age = (dob: string | null | undefined) => (dob ? differenceInYears(new Date(), parseISO(dob)) : null)
export const isMinor = (dob: string | null | undefined) => { const a = age(dob); return a !== null && a < 18 }
export const daysUntil = (d: string) => differenceInDays(parseISO(d), new Date())
export const fullName = (p: { first_name: string; last_name: string } | null | undefined) => (p ? `${p.last_name} ${p.first_name}` : '')

/** Accent-insensitive uppercase for Greek + Latin (mirrors public.unaccent_gr) */
export const normalizeGr = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/Σ$/g, 'Σ')

const DB_ERRORS: [RegExp, string][] = [
  [/club is not an active member of this organization/, 'Ο σύλλογος δεν είναι ενεργό μέλος αυτού του φορέα'],
  [/missing required documents: (.+)/, 'Λείπουν απαιτούμενα έγγραφα: $1'],
  [/minor without guardian/, 'Ανήλικος χωρίς κηδεμόνα'],
  [/missing data-processing consent/, 'Λείπει η συγκατάθεση επεξεργασίας δεδομένων'],
  [/no valid health card/, 'Δεν υπάρχει κάρτα υγείας σε ισχύ'],
  [/blocked by debt: (.+)/, '$1'],
  [/already has an active license with another club/, 'Ο αθλητής έχει ενεργό δελτίο με άλλο σύλλογο — απαιτείται μεταγραφή'],
  [/rejection requires a reason/, 'Η απόρριψη απαιτεί αιτιολογία'],
  [/duplicate key value.*licenses_one_open_idx/, 'Υπάρχει ήδη ανοιχτή αίτηση δελτίου για αυτόν τον αθλητή στο ίδιο άθλημα/περίοδο'],
  [/duplicate key value.*licenses_one_active_idx/, 'Υπάρχει ήδη δελτίο σε ισχύ για αυτόν τον αθλητή στο ίδιο άθλημα/περίοδο'],
  [/duplicate key value/, 'Η εγγραφή υπάρχει ήδη'],
  [/new row violates row-level security|permission denied|not allowed/, 'Δεν έχετε δικαίωμα για αυτή την ενέργεια'],
  [/need at least 2 (entries|confirmed teams)/, 'Χρειάζονται τουλάχιστον 2 ομάδες'],
  [/already has played matches; cannot regenerate/, 'Υπάρχουν ήδη παιγμένοι αγώνες· δεν ξαναδημιουργείται πρόγραμμα'],
  [/source group has no standings yet/, 'Ο όμιλος δεν έχει ακόμη βαθμολογία'],
  [/entries must belong to this competition/, 'Οι ομάδες πρέπει να ανήκουν σε αυτή τη διοργάνωση'],
]
export function errorMessage(e: unknown): string {
  if (!e) return ''
  const raw = typeof e === 'string' ? e : ((e as { message?: string; details?: string }).message ?? (e as { details?: string }).details ?? 'Error')
  for (const [re, gr] of DB_ERRORS) { const m = raw.match(re); if (m) return gr.replace('$1', m[1] ?? '') }
  return raw
}

/** Επίδοση: χρόνος σε δευτερόλεπτα → 11.85 / 2:05.31 · απόσταση/ύψος σε μέτρα → 6.42 m · βάρος kg · πόντοι */
export function fmtResult(value: number | string | null | undefined, resultType: string, unit?: string | null): string {
  if (value === null || value === undefined || value === '') return '—'
  const v = Number(value)
  if (resultType === 'time') {
    const m = Math.floor(v / 60); const s = v - m * 60
    const ss = s.toFixed(2).padStart(m > 0 ? 5 : 0, '0')
    return m > 0 ? `${m}:${ss}` : ss
  }
  if (resultType === 'distance' || resultType === 'height') return `${v.toFixed(2)} ${unit || 'm'}`
  if (resultType === 'weight') return `${v.toFixed(1)} ${unit || 'kg'}`
  return `${v}${unit ? ' ' + unit : ''}`
}
/** Αντίστροφα: "2:05.31" → 125.31, "11,85" → 11.85 */
export function parseResult(input: string): number | null {
  const t = input.trim().replace(',', '.'); if (!t) return null
  const m = t.match(/^(\d+):(\d+(?:\.\d+)?)$/); if (m) return Number(m[1]) * 60 + Number(m[2])
  const n = Number(t); return Number.isFinite(n) ? n : null
}
