/**
 * API layer — the ONLY place the UI talks to Supabase.
 * Everything is scoped by org_id (the tenant) and RLS enforces the rest.
 * This is also the seam where a future myTeam sync would plug in (external_ref).
 */
import { supabase, publicClient, DEV_AUTH, SUPABASE_URL, SUPABASE_ANON_KEY, getDevToken } from '@/lib/supabase'

const q = supabase
export type Row<T> = T & { id: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
// Results are `any` on purpose (untyped client, see lib/supabase.ts); shapes are documented per function.
function unwrap<T = any>(r: { data: unknown; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------
export const orgs = {
  get: async (id: string) => unwrap(await q.from('organizations').select('*').eq('id', id).single()),
  unionsOf: async (federationId: string) => unwrap(await q.from('organizations').select('*').eq('parent_id', federationId).order('name')),
  /** The body itself plus its child unions (federation scope) */
  scope: async (orgId: string): Promise<string[]> => {
    const kids = unwrap(await q.from('organizations').select('id').eq('parent_id', orgId))
    return [orgId, ...kids.map((k: { id: string }) => k.id)]
  },
  clubsOf: async (orgId: string) => {
    const scope = await orgs.scope(orgId)
    return unwrap(await q.from('org_affiliations').select('id, status, joined_at, member_no, sport_id, body_org_id, body:organizations!org_affiliations_body_org_id_fkey(id, short_name, name), club:organizations!org_affiliations_club_org_id_fkey(*)')
      .in('body_org_id', scope).order('joined_at'))
  },
  createClub: async (orgId: string, club: Record<string, unknown>, sportId: string | null) => {
    const c = unwrap(await q.from('organizations').insert({ ...club, type: 'club' }).select('id').single())
    unwrap(await q.from('org_affiliations').insert({ body_org_id: orgId, club_org_id: c.id, sport_id: sportId, joined_at: new Date().toISOString().slice(0, 10) }))
    return c.id
  },
  createUnion: async (federationId: string, union: Record<string, unknown>) =>
    unwrap(await q.from('organizations').insert({ ...union, type: 'union', parent_id: federationId }).select('id').single()),
  update: async (id: string, patch: Record<string, unknown>) => unwrap(await q.from('organizations').update(patch).eq('id', id).select('id').single()),
  contacts: async (orgId: string) => unwrap(await q.from('org_contacts').select('*').eq('org_id', orgId).order('is_primary', { ascending: false })),
  addContact: async (c: Record<string, unknown>) => unwrap(await q.from('org_contacts').insert(c).select('id').single()),
  deleteContact: async (id: string) => unwrap(await q.from('org_contacts').delete().eq('id', id)),
  settings: async (orgId: string) => unwrap(await q.from('org_settings').select('*').eq('org_id', orgId).single()),
  // Μόνο οι διακόπτες εμφάνισης — τους διαβάζει και ο σύλλογος/η ένωση (D-069)
  uiSettings: async (orgId: string) => ((unwrap(await q.rpc('ui_settings', { p_org: orgId })) as
    { org_id: string; sections_enabled: boolean; applications_from_athletes: boolean }[])[0] ?? null),
  updateSettings: async (orgId: string, patch: Record<string, unknown>) => unwrap(await q.from('org_settings').update(patch).eq('org_id', orgId).select('org_id').single()),
  seasons: async (orgId: string) => unwrap(await q.from('seasons').select('*').eq('org_id', orgId).order('starts_on', { ascending: false })),
  createSeason: async (s: Record<string, unknown>) => unwrap(await q.from('seasons').insert(s).select('id').single()),
  setCurrentSeason: async (orgId: string, id: string) => {
    unwrap(await q.from('seasons').update({ is_current: false }).eq('org_id', orgId).eq('is_current', true))
    unwrap(await q.from('seasons').update({ is_current: true }).eq('id', id))
  },
  sports: async () => unwrap(await q.from('sports').select('*').order('name_el')),
  categories: async (sportId: string, orgId: string) =>
    unwrap(await q.from('sport_categories').select('*').eq('sport_id', sportId).or(`org_id.is.null,org_id.eq.${orgId}`).order('sort_order')),
  scoringRules: async (sportId: string, orgId: string) =>
    unwrap(await q.from('sport_scoring_rules').select('*').eq('sport_id', sportId).or(`org_id.is.null,org_id.eq.${orgId}`)),
  rootOf: async (orgId: string) => unwrap(await q.rpc('root_org_id', { p_org: orgId })) as string,
}

// ---------------------------------------------------------------------------
// Registry: sections, persons, guardians, consents, documents, health cards
// ---------------------------------------------------------------------------
export const registry = {
  sections: async (orgId: string, clubId?: string | null) => {
    const scope = await orgs.scope(orgId)
    let s = q.from('sections').select('*, club:organizations!sections_club_org_id_fkey(id,name), sport:sports(id,code,name_el,name_en), category:sport_categories(id,name,code)').in('org_id', scope).order('name')
    if (clubId) s = s.eq('club_org_id', clubId)
    return unwrap(await s)
  },
  section: async (id: string) => unwrap(await q.from('sections').select('*, club:organizations!sections_club_org_id_fkey(id,name), sport:sports(id,code,name_el,name_en), category:sport_categories(id,name,code)').eq('id', id).single()),
  createSection: async (s: Record<string, unknown>) => unwrap(await q.from('sections').insert(s).select('id').single()),
  updateSection: async (id: string, patch: Record<string, unknown>) => unwrap(await q.from('sections').update(patch).eq('id', id).select('id').single()),
  sectionReadiness: async (sectionId: string) => unwrap(await q.from('section_readiness').select('*').eq('section_id', sectionId).order('last_name')),
  clubReadiness: async (clubId: string) => unwrap(await q.from('section_readiness').select('*').eq('club_org_id', clubId)),
  sectionMembers: async (sectionId: string) =>
    unwrap(await q.from('section_members').select('*, person:persons(id, first_name, last_name, birth_date, gender, photo_path, deleted_at)').eq('section_id', sectionId).is('left_at', null)),
  addSectionMember: async (m: Record<string, unknown>) => unwrap(await q.from('section_members').insert(m).select('id').single()),
  removeSectionMember: async (id: string) => unwrap(await q.from('section_members').delete().eq('id', id)),
  membershipsOf: async (personId: string) =>
    unwrap(await q.from('section_members').select('*, section:sections(id, name, club_org_id, sport:sports(name_el,name_en), club:organizations!sections_club_org_id_fkey(id,name))').eq('person_id', personId)),

  persons: async (opts: { orgId: string; clubId?: string | null; search?: string; role?: 'athlete' | 'coach' | 'all'; limit?: number }) => {
    // persons visible to the current user; filter by home club / search
    let s = q.from('persons').select('*, home_club:organizations!persons_home_club_org_id_fkey(id,name)', { count: 'exact' }).is('deleted_at', null)
      .order('last_name').order('first_name').limit(opts.limit ?? 500)
    if (opts.clubId) s = s.eq('home_club_org_id', opts.clubId)
    if (opts.search) s = s.or(`last_name.ilike.%${opts.search}%,first_name.ilike.%${opts.search}%,legacy_no.ilike.%${opts.search}%`)
    const r = await s
    if (r.error) throw new Error(r.error.message)
    return { rows: r.data ?? [], count: r.count ?? 0 }
  },
  person: async (id: string) => unwrap(await q.from('persons').select('*, home_club:organizations!persons_home_club_org_id_fkey(id,name)').eq('id', id).single()),
  createPerson: async (p: Record<string, unknown>) => unwrap(await q.from('persons').insert(p).select('id').single()),
  updatePerson: async (id: string, patch: Record<string, unknown>) => unwrap(await q.from('persons').update(patch).eq('id', id).select('id').single()),
  findDuplicates: async (orgId: string, lastName: string, firstName: string, birthDate: string | null) => {
    let s = q.from('persons').select('id, first_name, last_name, birth_date, home_club:organizations!persons_home_club_org_id_fkey(name)').eq('managed_by_org_id', orgId).is('deleted_at', null)
      .ilike('last_name', lastName).ilike('first_name', firstName)
    if (birthDate) s = s.eq('birth_date', birthDate)
    return unwrap(await s.limit(5))
  },
  guardians: async (wardId: string) => unwrap(await q.from('guardianships').select('*, guardian:persons!guardianships_guardian_person_id_fkey(id, first_name, last_name, email, phone)').eq('ward_person_id', wardId)),
  addGuardian: async (g: Record<string, unknown>) => unwrap(await q.from('guardianships').insert(g).select('id').single()),
  removeGuardian: async (id: string) => unwrap(await q.from('guardianships').delete().eq('id', id)),
  consents: async (personId: string) => unwrap(await q.from('consents').select('*').eq('person_id', personId).order('given_at', { ascending: false })),
  addConsent: async (c: Record<string, unknown>) => unwrap(await q.from('consents').insert(c).select('id').single()),
  withdrawConsent: async (id: string) => unwrap(await q.from('consents').update({ withdrawn_at: new Date().toISOString() }).eq('id', id)),
  documents: async (personId: string) => unwrap(await q.from('documents').select('*').eq('person_id', personId).order('uploaded_at', { ascending: false })),
  addDocument: async (d: Record<string, unknown>) => unwrap(await q.from('documents').insert(d).select('*').single()),
  deleteDocument: async (id: string) => unwrap(await q.from('documents').delete().eq('id', id)),
  uploadFile: async (bucket: string, path: string, file: File) => {
    const r = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
    if (r.error) throw new Error(r.error.message)
    return r.data.path
  },
  healthCards: async (personId: string) => unwrap(await q.from('health_cards').select('*').eq('person_id', personId).order('expires_on', { ascending: false })),
  addHealthCard: async (h: Record<string, unknown>) => unwrap(await q.from('health_cards').insert(h).select('id').single()),
  verifyHealthCard: async (id: string) => unwrap(await q.from('health_cards').update({ verified_at: new Date().toISOString() }).eq('id', id).select('id').single()),
  expiringHealthCards: async (orgId: string) => unwrap(await q.from('expiring_health_cards').select('*').eq('org_id', orgId).order('expires_on')),
  allHealthCards: async (orgId: string) =>
    unwrap(await q.from('health_cards').select('*, person:persons(id, first_name, last_name, birth_date, home_club:organizations!persons_home_club_org_id_fkey(id,name))').eq('org_id', orgId).order('expires_on')),
}

// ---------------------------------------------------------------------------
// Licenses
// ---------------------------------------------------------------------------
export const LICENSE_SELECT = '*, person:persons(id, first_name, last_name, birth_date, gender, photo_path), club:organizations!licenses_club_org_id_fkey(id, name), sport:sports(id, code, name_el, name_en), season:seasons(id, name), issuer:organizations!licenses_issuer_org_id_fkey(id, name, short_name), handler:organizations!licenses_org_id_fkey(id, name, short_name)'
export const licenses = {
  list: async (opts: { orgId?: string; issuerId?: string; clubId?: string | null; status?: string[]; seasonId?: string; limit?: number }) => {
    let s = q.from('licenses').select(LICENSE_SELECT, { count: 'exact' }).order('updated_at', { ascending: false }).limit(opts.limit ?? 1000)
    if (opts.orgId && opts.issuerId && opts.orgId !== opts.issuerId) s = s.or(`org_id.eq.${opts.orgId},issuer_org_id.eq.${opts.issuerId}`)
    else if (opts.orgId) s = s.eq('org_id', opts.orgId)
    if (opts.clubId) s = s.eq('club_org_id', opts.clubId)
    if (opts.status?.length) s = s.in('status', opts.status)
    if (opts.seasonId) s = s.eq('season_id', opts.seasonId)
    const r = await s
    if (r.error) throw new Error(r.error.message)
    return { rows: r.data ?? [], count: r.count ?? 0 }
  },
  get: async (id: string) => unwrap(await q.from('licenses').select(LICENSE_SELECT).eq('id', id).single()),
  byPerson: async (personId: string) => unwrap(await q.from('licenses').select(LICENSE_SELECT).eq('person_id', personId).order('created_at', { ascending: false })),
  create: async (l: Record<string, unknown>) => unwrap(await q.from('licenses').insert(l).select('id').single()),
  requirements: async (orgIds: string[]) => unwrap(await q.from('license_requirements').select('*').in('org_id', orgIds).order('sort_order')),
  saveRequirement: async (r: Record<string, unknown>) => unwrap(await q.from('license_requirements').insert(r).select('id').single()),
  deleteRequirement: async (id: string) => unwrap(await q.from('license_requirements').delete().eq('id', id)),
  documents: async (licenseId: string) => unwrap(await q.from('license_documents').select('*, document:documents(*)').eq('license_id', licenseId)),
  attach: async (licenseId: string, documentId: string, docType: string) => unwrap(await q.from('license_documents').insert({ license_id: licenseId, document_id: documentId, doc_type: docType }).select('id').single()),
  detach: async (id: string) => unwrap(await q.from('license_documents').delete().eq('id', id)),
  checkDoc: async (id: string, status: 'ok' | 'problem', note?: string) => unwrap(await q.from('license_documents').update({ check_status: status, check_note: note ?? null, checked_at: new Date().toISOString() }).eq('id', id)),
  missing: async (licenseId: string) => unwrap(await q.rpc('license_missing_documents', { p_license: licenseId })) as string[],
  createDrafts: async (orgId: string, clubId: string, sportId: string, seasonId: string, personIds: string[], submit: boolean) =>
    unwrap(await q.rpc('create_license_drafts', { p_org: orgId, p_club: clubId, p_sport: sportId, p_season: seasonId, p_person_ids: personIds, p_submit: submit })) as { person_id: string; license_id: string | null; ok: boolean; error: string | null }[],
  returnToApplicant: async (licenseId: string, note: string) => unwrap(await q.rpc('return_application', { p_license: licenseId, p_note: note })),
  history: async (licenseId: string) => unwrap(await q.from('license_status_history').select('*, actor:profiles(full_name)').eq('license_id', licenseId).order('at')),
  transition: async (id: string, action: string, note?: string) => unwrap(await q.rpc('transition_license', { p_license: id, p_action: action, p_note: note ?? null })),
  bulk: async (ids: string[], action: string, note?: string) => unwrap(await q.rpc('bulk_transition_licenses', { p_ids: ids, p_action: action, p_note: note ?? null })) as { license_id: string; ok: boolean; error: string | null }[],
  renew: async (ids: string[], seasonId: string) => unwrap(await q.rpc('renew_licenses', { p_ids: ids, p_new_season: seasonId })) as { license_id: string; new_license_id: string | null; ok: boolean; error: string | null }[],
  canSubmit: async (clubId: string, orgId: string) => unwrap(await q.rpc('can_submit_license', { p_club: clubId, p_org: orgId })) as { allowed: boolean; reason: string | null; balance: number }[],
}

// ---------------------------------------------------------------------------
// Μεταγραφές (Φάση 13-A) — docs/07 §1
// ---------------------------------------------------------------------------
export const transfers = {
  queue: async (opts: { orgId: string; status?: string[]; clubId?: string | null }) => {
    let s = q.from('transfer_queue').select('*').order('created_at', { ascending: false })
    if (opts.clubId) s = s.or(`to_club_org_id.eq.${opts.clubId},from_club_org_id.eq.${opts.clubId}`)
    else s = s.eq('org_id', opts.orgId)
    if (opts.status?.length) s = s.in('status', opts.status)
    return unwrap(await s)
  },
  get: async (id: string) => unwrap(await q.from('transfer_queue').select('*').eq('id', id).single()),
  windows: async (orgIds: string[]) => unwrap(await q.from('transfer_windows').select('*, sport:sports(name_el)').in('org_id', orgIds).order('opens_on', { ascending: false })),
  saveWindow: async (w: Record<string, unknown>) => unwrap(await q.from('transfer_windows').insert(w).select('id').single()),
  deleteWindow: async (id: string) => unwrap(await q.from('transfer_windows').delete().eq('id', id)),
  find: async (orgId: string, licenseNo: string, toClub?: string | null) =>
    unwrap(await q.rpc('find_license_for_transfer', { p_org: orgId, p_license_no: licenseNo, p_to_club: toClub ?? null })) as
      { license_id: string; last_name: string; first_name: string; birth_year: number; club_name: string; club_org_id: string; sport_name: string; can_transfer: boolean; reason: string | null }[],
  can: async (licenseId: string, toClub: string) =>
    (unwrap(await q.rpc('can_transfer', { p_license: licenseId, p_to_club: toClub })) as { allowed: boolean; reason: string | null; window_id: string | null }[])[0],
  create: async (licenseId: string, toClub: string, note?: string) =>
    unwrap(await q.rpc('create_transfer', { p_license: licenseId, p_to_club: toClub, p_note: note ?? null })),
  transition: async (id: string, to: string, note?: string) =>
    unwrap(await q.rpc('transition_transfer', { p_transfer: id, p_to: to, p_note: note ?? null })),
  documents: async (transferId: string) => unwrap(await q.from('transfer_documents').select('*, document:documents(*)').eq('transfer_id', transferId)),
  attach: async (transferId: string, documentId: string, docType: string) =>
    unwrap(await q.from('transfer_documents').insert({ transfer_id: transferId, document_id: documentId, doc_type: docType }).select('id').single()),
  detach: async (id: string) => unwrap(await q.from('transfer_documents').delete().eq('id', id)),
  checkDoc: async (id: string, status: 'ok' | 'problem', note?: string) =>
    unwrap(await q.from('transfer_documents').update({ check_status: status, check_note: note ?? null, checked_at: new Date().toISOString() }).eq('id', id)),
  history: async (transferId: string) => unwrap(await q.from('transfer_status_history').select('*, actor:profiles(full_name)').eq('transfer_id', transferId).order('at')),
  clubHistory: async (personId: string) => unwrap(await q.from('person_club_history').select('*').eq('person_id', personId).order('completed_at', { ascending: false })),
}

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------
export const finance = {
  balances: async (orgId: string) => unwrap(await q.from('account_balances').select('*').eq('org_id', orgId).order('balance', { ascending: false })),
  balancesOfClub: async (clubId: string) => unwrap(await q.from('account_balances').select('*').eq('club_org_id', clubId)),
  account: async (accountId: string) => unwrap(await q.from('account_balances').select('*').eq('account_id', accountId).single()),
  accountFor: async (orgId: string, clubId: string) => unwrap(await q.from('ledger_accounts').select('id').eq('org_id', orgId).eq('club_org_id', clubId).maybeSingle()),
  entries: async (accountId: string) => unwrap(await q.from('ledger_entries').select('*, fee_type:fee_types(code, name, category)').eq('account_id', accountId).order('posted_at').order('id')),
  openCharges: async (accountId: string) => unwrap(await q.from('charge_open_amounts').select('*').eq('account_id', accountId).gt('open_amount', 0).order('due_on')),
  payments: async (accountId: string) => unwrap(await q.from('payments').select('*, allocations:payment_allocations(*)').eq('account_id', accountId).order('paid_on', { ascending: false })),
  payment: async (id: string) => unwrap(await q.from('payments').select('*, allocations:payment_allocations(*, charge:ledger_entries(description, amount)), account:ledger_accounts(org_id, club_org_id, club:organizations!ledger_accounts_club_org_id_fkey(name, vat_number, address_city), org:organizations!ledger_accounts_org_id_fkey(name, vat_number, address_city, logo_path))').eq('id', id).single()),
  feeTypes: async (orgId: string) => unwrap(await q.from('fee_types').select('*, prices:price_list_items(*)').eq('org_id', orgId).order('name')),
  saveFeeType: async (f: Record<string, unknown>) => unwrap(await q.from('fee_types').insert(f).select('id').single()),
  updateFeeType: async (id: string, patch: Record<string, unknown>) => unwrap(await q.from('fee_types').update(patch).eq('id', id)),
  addPrice: async (p: Record<string, unknown>) => unwrap(await q.from('price_list_items').insert(p).select('id').single()),
  deletePrice: async (id: string) => unwrap(await q.from('price_list_items').delete().eq('id', id)),
  postCharge: async (a: { orgId: string; clubId: string; feeTypeId: string; amount: number | null; description?: string; dueOn?: string; seasonId?: string }) =>
    unwrap(await q.rpc('post_charge', { p_org: a.orgId, p_club: a.clubId, p_fee_type: a.feeTypeId, p_amount: a.amount, p_description: a.description ?? null, p_source_type: 'manual', p_source_id: null, p_due_on: a.dueOn ?? null, p_season: a.seasonId ?? null, p_sport: null, p_category: null })),
  recordPayment: async (a: { orgId: string; clubId: string; amount: number; method: string; paidOn: string; referenceNo?: string; payer?: string; notes?: string; allocations?: { charge_entry_id: string; amount: number }[] | null }) =>
    unwrap(await q.rpc('record_payment', { p_org: a.orgId, p_club: a.clubId, p_amount: a.amount, p_method: a.method, p_paid_on: a.paidOn, p_reference_no: a.referenceNo ?? null, p_payer_name: a.payer ?? null, p_notes: a.notes ?? null, p_allocations: a.allocations ?? null })),
  reverse: async (entryId: string, reason: string) => unwrap(await q.rpc('reverse_entry', { p_entry: entryId, p_reason: reason })),
  reminders: async (accountId: string) => unwrap(await q.from('reminders').select('*').eq('account_id', accountId).order('sent_at', { ascending: false })),
  addReminder: async (r: Record<string, unknown>) => unwrap(await q.from('reminders').insert(r).select('id').single()),
  exemptions: async (accountId: string) => unwrap(await q.from('debt_exemptions').select('*').eq('account_id', accountId).order('until_date', { ascending: false })),
  addExemption: async (e: Record<string, unknown>) => unwrap(await q.from('debt_exemptions').insert(e).select('id').single()),
  clubContacts: async (clubId: string) => unwrap(await q.from('org_contacts').select('email, full_name, is_primary').eq('org_id', clubId)),
}

// ---------------------------------------------------------------------------
// Competitions
// ---------------------------------------------------------------------------
export const competitions = {
  list: async (orgId: string) => unwrap(await q.from('competitions').select('*, season:seasons(name), sport:sports(code,name_el,name_en), category:sport_categories(name)').eq('org_id', orgId).order('created_at', { ascending: false })),
  get: async (id: string) => unwrap(await q.from('competitions').select('*, season:seasons(id,name), sport:sports(id,code,name_el,name_en,kind), category:sport_categories(id,name), org:organizations!competitions_org_id_fkey(id,name,slug), rule:sport_scoring_rules(id,name,points,tiebreakers)').eq('id', id).single()),
  /** format: league (round-robin) · cup (knockout) · league_playoffs (round-robin + knockout stage) · meet (αγωνίσματα, ατομικά) */
  create: async (c: Record<string, unknown>, format: 'league' | 'cup' | 'league_playoffs' | 'meet' = 'league') => {
    const comp = unwrap(await q.from('competitions').insert(c).select('id, org_id').single())
    if (format === 'meet') return comp.id
    if (format !== 'cup') {
      const stage = unwrap(await q.from('competition_stages').insert({ competition_id: comp.id, org_id: comp.org_id, name: 'Κανονική περίοδος', kind: 'round_robin', legs: 2, sort_order: 1 }).select('id').single())
      unwrap(await q.from('competition_groups').insert({ stage_id: stage.id, org_id: comp.org_id, name: 'Όμιλος Α' }))
    }
    if (format !== 'league') {
      const ko = unwrap(await q.from('competition_stages').insert({ competition_id: comp.id, org_id: comp.org_id, name: format === 'cup' ? 'Ταμπλό' : 'Playoffs', kind: 'knockout', legs: 1, sort_order: 2 }).select('id').single())
      unwrap(await q.from('competition_groups').insert({ stage_id: ko.id, org_id: comp.org_id, name: format === 'cup' ? 'Κύριο ταμπλό' : 'Playoffs' }))
    }
    return comp.id
  },
  addStage: async (competitionId: string, orgId: string, name: string, kind: 'round_robin' | 'knockout' | 'heats', sortOrder: number) => {
    const st = unwrap(await q.from('competition_stages').insert({ competition_id: competitionId, org_id: orgId, name, kind, legs: kind === 'knockout' ? 1 : 2, sort_order: sortOrder }).select('id').single())
    unwrap(await q.from('competition_groups').insert({ stage_id: st.id, org_id: orgId, name }))
    return st.id
  },
  generateKnockout: async (groupId: string, entryIds: string[], startDate: string | null, daysBetween: number) => unwrap(await q.rpc('generate_knockout', { p_group: groupId, p_entry_ids: entryIds, p_start_date: startDate, p_days_between: daysBetween })) as number,
  knockoutFromStandings: async (groupId: string, sourceGroupId: string, top: number, startDate: string | null, daysBetween: number) => unwrap(await q.rpc('knockout_from_standings', { p_target_group: groupId, p_source_group: sourceGroupId, p_top: top, p_start_date: startDate, p_days_between: daysBetween })) as number,
  update: async (id: string, patch: Record<string, unknown>) => unwrap(await q.from('competitions').update(patch).eq('id', id)),
  /** Όμιλοι για πολλές διοργανώσεις μαζί — ώστε το dashboard να βρει ποια έχει πραγματική βαθμολογία */
  groupsOfMany: async (competitionIds: string[]) => competitionIds.length === 0 ? [] : unwrap(await q.from('competition_groups')
    .select('*, stage:competition_stages!inner(id, competition_id, name, kind, sort_order)')
    .in('stage.competition_id', competitionIds).order('sort_order')) as Promise<{ id: string; stage: { competition_id: string; kind: string } }[]>,
  groups: async (competitionId: string) => unwrap(await q.from('competition_groups').select('*, stage:competition_stages!inner(id, competition_id, name, kind, legs, sort_order)').eq('stage.competition_id', competitionId).order('sort_order')),
  addGroup: async (g: Record<string, unknown>) => unwrap(await q.from('competition_groups').insert(g).select('id').single()),
  entries: async (competitionId: string) => unwrap(await q.from('competition_entries').select('*, club:organizations!competition_entries_club_org_id_fkey(id,name), section:sections(id,name)').eq('competition_id', competitionId).order('seed')),
  addEntry: async (e: Record<string, unknown>) => unwrap(await q.from('competition_entries').insert(e).select('id').single()),
  updateEntry: async (id: string, patch: Record<string, unknown>) => unwrap(await q.from('competition_entries').update(patch).eq('id', id)),
  generate: async (groupId: string, legs: number, startDate: string | null, daysBetween: number) => unwrap(await q.rpc('generate_round_robin', { p_group: groupId, p_legs: legs, p_start_date: startDate, p_days_between: daysBetween })) as number,
  matches: async (competitionId: string) => unwrap(await q.from('matches').select('*, round:rounds(id, round_no, name, scheduled_on), home:competition_entries!matches_home_entry_id_fkey(id, display_name), away:competition_entries!matches_away_entry_id_fkey(id, display_name), venue:venues(id, name)').eq('competition_id', competitionId).order('scheduled_at')),
  updateMatch: async (id: string, patch: Record<string, unknown>) => unwrap(await q.from('matches').update(patch).eq('id', id)),
  standings: async (groupId: string) => unwrap(await q.from('standings').select('*, entry:competition_entries(display_name, club_org_id)').eq('group_id', groupId).order('rank')),
  venues: async (orgId: string) => unwrap(await q.from('venues').select('*').eq('org_id', orgId).order('name')),
  addVenue: async (v: Record<string, unknown>) => unwrap(await q.from('venues').insert(v).select('id').single()),
}

// ---------------------------------------------------------------------------
// Rosters (Φάση 1.5-A): δηλωμένοι αθλητές ανά συμμετοχή + επιλεξιμότητα
// ---------------------------------------------------------------------------
export const rosters = {
  list: async (entryId: string) => unwrap(await q.from('entry_athletes').select('*, person:persons(id, first_name, last_name, birth_date, gender), license:licenses(id, license_no, status, valid_to)').eq('entry_id', entryId).order('shirt_no', { nullsFirst: false }).order('declared_at')),
  /** athletes of the club's sections in the competition's sport, not yet declared */
  candidates: async (_orgId: string, clubId: string, sportId: string, entryId: string) => {
    const [members, declared] = await Promise.all([
      q.from('section_members').select('person_id, person:persons(id, first_name, last_name, birth_date, gender), section:sections!inner(id, name, org_id, club_org_id, sport_id)').eq('member_role', 'athlete').eq('section.club_org_id', clubId).eq('section.sport_id', sportId),
      q.from('entry_athletes').select('person_id').eq('entry_id', entryId),
    ])
    const taken = new Set((unwrap(declared) as { person_id: string }[]).map(d => d.person_id))
    const seen = new Set<string>()
    return (unwrap(members) as { person_id: string; person: Record<string, unknown>; section: { name: string } }[])
      .filter(m => !taken.has(m.person_id) && !seen.has(m.person_id) && seen.add(m.person_id))
      .sort((x, y) => String((x.person as { last_name: string }).last_name).localeCompare(String((y.person as { last_name: string }).last_name)))
  },
  declare: async (rows: { entry_id: string; person_id: string; shirt_no?: number | null }[]) => unwrap(await q.from('entry_athletes').insert(rows).select('id, status, ineligible_reason')),
  update: async (id: string, patch: Record<string, unknown>) => unwrap(await q.from('entry_athletes').update(patch).eq('id', id).select('id, status, ineligible_reason').single()),
  remove: async (id: string) => unwrap(await q.from('entry_athletes').delete().eq('id', id)),
  recheck: async (entryId: string) => unwrap(await q.rpc('recheck_entry_athletes', { p_entry: entryId, p_person: null })) as number,
  clubSummary: async (clubId: string) => unwrap(await q.from('club_competition_summary').select('*').eq('club_org_id', clubId).order('season_name', { ascending: false })),
  personActivity: async (personId: string) => unwrap(await q.from('person_competition_activity').select('*').eq('person_id', personId).order('season_name', { ascending: false })),
}

// ---------------------------------------------------------------------------
// Events & results (Φάση 1.5-C): αγωνίσματα, σειρές/τελικοί, επιδόσεις
// ---------------------------------------------------------------------------
export const events = {
  list: async (competitionId: string) => unwrap(await q.from('competition_events').select('*, category:sport_categories(id,name)').eq('competition_id', competitionId).order('sort_order').order('created_at')),
  create: async (e: Record<string, unknown>) => unwrap(await q.from('competition_events').insert(e).select('id').single()),
  update: async (id: string, patch: Record<string, unknown>) => unwrap(await q.from('competition_events').update(patch).eq('id', id)),
  remove: async (id: string) => unwrap(await q.from('competition_events').delete().eq('id', id)),
  entries: async (eventId: string) => unwrap(await q.from('competition_entries').select('*, person:persons(id, first_name, last_name, birth_date), club:organizations!competition_entries_club_org_id_fkey(id, name), athlete:entry_athletes(id, status, ineligible_reason, license_id)').eq('event_id', eventId).order('seed', { nullsFirst: false }).order('display_name')),
  addEntries: async (rows: Record<string, unknown>[]) => unwrap(await q.from('competition_entries').insert(rows).select('id')),
  updateEntry: async (id: string, patch: Record<string, unknown>) => unwrap(await q.from('competition_entries').update(patch).eq('id', id)),
  /** athletes of the org's sections in this sport (club manager: own club only) */
  candidates: async (orgId: string, sportId: string, clubId: string | null) => {
    let qq = q.from('section_members').select('person_id, person:persons(id, first_name, last_name, birth_date, gender, home_club_org_id), section:sections!inner(id, name, org_id, club_org_id, sport_id, club:organizations!sections_club_org_id_fkey(id, name))').eq('member_role', 'athlete').eq('section.org_id', orgId).eq('section.sport_id', sportId)
    if (clubId) qq = qq.eq('section.club_org_id', clubId)
    const seen = new Set<string>()
    return (unwrap(await qq) as { person_id: string; person: Record<string, unknown>; section: { club_org_id: string; club: { name: string } } }[]).filter(m => !seen.has(m.person_id) && seen.add(m.person_id))
  },
  groups: async (eventId: string) => unwrap(await q.from('competition_groups').select('*').eq('event_id', eventId).order('sort_order')),
  results: async (eventId: string) => unwrap(await q.from('results').select('*, entry:competition_entries(id, display_name, club_org_id, person_id, club:organizations!competition_entries_club_org_id_fkey(name))').eq('event_id', eventId).order('lane')),
  updateResult: async (id: string, patch: Record<string, unknown>) => unwrap(await q.from('results').update(patch).eq('id', id).select('id, rank, overall_rank').single()),
  assignHeats: async (eventId: string, size: number, directFinal: boolean) => unwrap(await q.rpc('assign_heats', { p_event: eventId, p_heat_size: size, p_direct_final: directFinal })) as number,
  createFinal: async (eventId: string, top: number) => unwrap(await q.rpc('create_final', { p_event: eventId, p_top: top })) as string,
  personResults: async (personId: string) => unwrap(await q.from('person_results').select('*').eq('person_id', personId).order('entered_at', { ascending: false })),
  clubMedals: async (clubId: string) => unwrap(await q.from('club_medals').select('*').eq('club_org_id', clubId).order('season_name', { ascending: false })),
}

// ---------------------------------------------------------------------------
// Αίτηση δελτίου από αθλητή/κηδεμόνα (12-B): links, δημόσια RPCs, ανέβασμα
// ---------------------------------------------------------------------------
export const applications = {
  links: async (orgId: string, clubId?: string | null) => {
    let s = q.from('application_links').select('*, club:organizations!application_links_club_org_id_fkey(id, name), person:persons(id, first_name, last_name), section:sections(id, name), sport:sports(name_el)').eq('org_id', orgId).is('revoked_at', null).order('created_at', { ascending: false })
    if (clubId) s = s.eq('club_org_id', clubId)
    return unwrap(await s)
  },
  createLink: async (l: Record<string, unknown>) => unwrap(await q.from('application_links').insert(l).select('*').single()),
  revokeLink: async (id: string) => unwrap(await q.from('application_links').update({ revoked_at: new Date().toISOString() }).eq('id', id)),
  // anon side
  sendLinkEmail: async (linkId: string, email: string, message?: string) => unwrap(await q.rpc('send_application_link', { p_link: linkId, p_email: email, p_message: message ?? null })),
  emailsForLicense: async (licenseId: string) => unwrap(await q.from('email_log').select('id, to_email, template, status, created_at, sent_at, error').eq('payload->>license_id', licenseId).order('created_at', { ascending: false })) as Promise<{ id: string; to_email: string; template: string; status: string; created_at: string; sent_at: string | null; error: string | null }[]>,
  context: async (token: string) => unwrap(await publicClient.rpc('apply_context', { p_token: token })),
  submit: async (token: string, payload: Record<string, unknown>) => unwrap(await publicClient.rpc('apply_submit', { p_token: token, p: payload })) as { license_id: string; track_token: string; person_id: string },
  track: async (token: string) => unwrap(await publicClient.rpc('track_license', { p_token: token })),
  upload: async (token: string, docType: string, file: File) => {
    const path = `${token}/${docType}-${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`
    if (DEV_AUTH) return path   // τοπικά: χωρίς Storage API, καταγράφεται μόνο η διαδρομή
    const r = await publicClient.storage.from('applications').upload(path, file, { upsert: false })
    if (r.error) throw new Error(r.error.message)
    return r.data.path
  },
}

// ---------------------------------------------------------------------------
// Members & invitations
// ---------------------------------------------------------------------------
export const members = {
  list: async (orgId: string) => unwrap(await q.from('org_members').select('*, profile:profiles(full_name), club:organizations!org_members_club_org_id_fkey(name)').eq('org_id', orgId).order('created_at')),
  update: async (id: string, patch: Record<string, unknown>) => unwrap(await q.from('org_members').update(patch).eq('id', id)),
  invitations: async (orgId: string) => unwrap(await q.from('invitations').select('*, club:organizations!invitations_club_org_id_fkey(name)').eq('org_id', orgId).is('accepted_at', null).order('created_at', { ascending: false })),
  invite: async (i: Record<string, unknown>) => unwrap(await q.from('invitations').insert(i).select('*').single()),
  revoke: async (id: string) => unwrap(await q.from('invitations').delete().eq('id', id)),
  accept: async (token: string) => unwrap(await q.rpc('accept_invitation', { p_token: token })),
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
export const imports = {
  list: async (orgId: string) => unwrap(await q.from('import_batches').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(20)),
  createBatch: async (b: Record<string, unknown>) => unwrap(await q.from('import_batches').insert(b).select('id').single()),
  updateBatch: async (id: string, patch: Record<string, unknown>) => unwrap(await q.from('import_batches').update(patch).eq('id', id)),
  addRows: async (rows: Record<string, unknown>[]) => unwrap(await q.from('import_rows').insert(rows)),
}

// ---------------------------------------------------------------------------
// Dashboard & audit
// ---------------------------------------------------------------------------
export const dashboard = {
  counts: async (orgId: string, issuerId: string) => {
    const [clubs, athletes, pending, issued, bal, exp, comps] = await Promise.all([
      q.from('org_affiliations').select('id', { count: 'exact', head: true }).eq('body_org_id', orgId).eq('status', 'active'),
      q.from('section_members').select('id, section:sections!inner(org_id)', { count: 'exact', head: true }).eq('member_role', 'athlete').eq('section.org_id', orgId),
      q.from('licenses').select('id', { count: 'exact', head: true }).or(`org_id.eq.${orgId},issuer_org_id.eq.${issuerId}`).in('status', ['submitted', 'under_review', 'approved']),
      q.from('licenses').select('id', { count: 'exact', head: true }).or(`org_id.eq.${orgId},issuer_org_id.eq.${issuerId}`).eq('status', 'issued'),
      q.from('account_balances').select('balance').eq('org_id', orgId),
      q.from('expiring_health_cards').select('health_card_id', { count: 'exact', head: true }).eq('org_id', orgId),
      q.from('competitions').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'in_progress'),
    ])
    return {
      clubs: clubs.count ?? 0, athletes: athletes.count ?? 0, pending: pending.count ?? 0, issued: issued.count ?? 0,
      openBalance: (bal.data ?? []).reduce((s, r) => s + Math.max(0, Number(r.balance)), 0),
      debtors: (bal.data ?? []).filter(r => Number(r.balance) > 0).length,
      expiring: exp.count ?? 0, competitions: comps.count ?? 0,
    }
  },
  audit: async (orgId: string, limit = 20) => unwrap(await q.from('audit_log').select('*, actor:profiles(full_name)').eq('org_id', orgId).order('at', { ascending: false }).limit(limit)),
}

// ---------------------------------------------------------------------------
// Public (anonymous) surface
// ---------------------------------------------------------------------------
export const pub = {
  org: async (slug: string) => unwrap(await publicClient.from('public_organizations').select('*').eq('slug', slug).maybeSingle()),
  competitions: async (orgId: string) => unwrap(await publicClient.from('public_competitions').select('*').eq('org_id', orgId).order('updated_at', { ascending: false })),
  competition: async (orgSlug: string, slug: string) => unwrap(await publicClient.from('public_competitions').select('*').eq('org_slug', orgSlug).eq('slug', slug).maybeSingle()),
  competitionById: async (id: string) => unwrap(await publicClient.from('public_competitions').select('*').eq('id', id).maybeSingle()),
  groups: async (competitionId: string) => unwrap(await publicClient.from('public_competition_groups').select('*').eq('competition_id', competitionId).order('sort_order')),
  matches: async (competitionId: string) => unwrap(await publicClient.from('public_matches').select('*').eq('competition_id', competitionId).order('round_no').order('scheduled_at')),
  standings: async (competitionId: string) => unwrap(await publicClient.from('public_standings').select('*').eq('competition_id', competitionId).order('rank')),
  verify: async (token: string) => unwrap(await publicClient.rpc('verify_license', { p_token: token })),
  events: async (competitionId: string) => unwrap(await publicClient.from('public_events').select('*').eq('competition_id', competitionId).order('sort_order')),
  results: async (competitionId: string) => unwrap(await publicClient.from('public_results').select('*').eq('competition_id', competitionId).order('group_order').order('lane')),
}

// ---------------------------------------------------------------------------
// Μαχητικά (Φάση 1.5-D): κατηγορία βάρους = στάδιο knockout με sport_category
// ---------------------------------------------------------------------------
export const combat = {
  /** Οι κατηγορίες της διοργάνωσης (στάδια knockout με κατηγορία), με τον όμιλό τους */
  categories: async (competitionId: string) => unwrap(await q.from('competition_stages')
    .select('id, name, sort_order, weigh_in_required, category:sport_categories(id, name, code, gender, weight_min_kg, weight_max_kg, belt_min, belt_max), groups:competition_groups(id, name)')
    .eq('competition_id', competitionId).eq('kind', 'knockout').order('sort_order')),
  /** Δηλωμένοι αθλητές της κατηγορίας, με ζύγιση, ζώνη (από το δελτίο) και επιλεξιμότητα */
  entries: async (groupId: string) => unwrap(await q.from('competition_entries')
    .select('id, seed, status, display_name, person_id, club_org_id, person:persons(id, first_name, last_name, birth_date, gender), club:organizations!competition_entries_club_org_id_fkey(id, name), athlete:entry_athletes(id, status, ineligible_reason, weigh_in_kg, license:licenses(id, license_no, metadata))')
    .eq('group_id', groupId).order('seed', { nullsFirst: false }).order('display_name')),
  /** Αθλητές με δελτίο σε ισχύ στο άθλημα, για δήλωση σε κατηγορία */
  candidates: async (orgId: string, sportId: string, clubId: string | null) => {
    let s = q.from('licenses').select('person_id, license_no, metadata, club_org_id, person:persons!inner(id, first_name, last_name, birth_date, gender, deleted_at), club:organizations!licenses_club_org_id_fkey(id, name)')
      .eq('sport_id', sportId).eq('status', 'issued').is('person.deleted_at', null).limit(500)
    if (clubId) s = s.eq('club_org_id', clubId)
    void orgId
    return unwrap(await s)
  },
  addEntries: async (rows: Record<string, unknown>[]) => unwrap(await q.from('competition_entries').insert(rows).select('id')),
  removeEntry: async (id: string) => unwrap(await q.from('competition_entries').delete().eq('id', id)),
  /** Ζύγιση από τη γραμματεία αγώνων — ξαναπερνά τον έλεγχο βάρους */
  weighIn: async (entryId: string, kg: number | null) => unwrap(await q.rpc('record_weigh_in', { p_entry: entryId, p_kg: kg })),
  /** Θέσεις ταμπλό: 1, 2 και δύο χάλκινα */
  placements: async (groupId: string) => unwrap(await q.from('bracket_results')
    .select('entry_id, place, display_name, club_org_id, person_id').eq('group_id', groupId).order('place')) as Promise<{ entry_id: string; place: number; display_name: string; club_org_id: string | null; person_id: string | null }[]>,
}

// ---------------------------------------------------------------------------
// AI έλεγχος δικαιολογητικών (Edge Function check-documents) — Φάση 12-D
// ---------------------------------------------------------------------------
export type DocCheck = { status: 'ok' | 'problem' | 'uncertain' | 'skipped'; confidence?: number; issues: string[]; extracted?: Record<string, unknown>; model?: string; error?: string }
async function callCheck(body: Record<string, unknown>, withUser: boolean): Promise<Record<string, unknown> | null> {
  if (DEV_AUTH) return null   // τοπικά δεν τρέχουν Edge Functions· το έγγραφο μένει «pending» για ανθρώπινο έλεγχο
  let token = SUPABASE_ANON_KEY
  if (withUser) token = getDevToken() ?? (await supabase.auth.getSession()).data.session?.access_token ?? SUPABASE_ANON_KEY
  const r = await fetch(`${SUPABASE_URL}/functions/v1/check-documents`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`AI check failed (${r.status})`)
  return r.json()
}
export const ai = {
  /** Wizard: άμεσος έλεγχος μετά το ανέβασμα, πριν την υποβολή (δεν γράφει τίποτα) */
  precheck: async (token: string, storagePath: string, docType: string, person: Record<string, unknown>, guardian: Record<string, unknown> | null) =>
    (await callCheck({ token, storage_path: storagePath, doc_type: docType, person, guardian }, false)) as DocCheck | null,
  /** Γραμματεία / έφορος: έλεγχος όλων των συνημμένων μιας αίτησης — καταγράφεται και εφαρμόζεται η πολιτική του φορέα */
  checkLicense: async (licenseId: string) => (await callCheck({ license_id: licenseId }, true)) as { results: (DocCheck & { document_id: string })[] } | null,
  checkDocument: async (documentId: string, licenseId?: string) => (await callCheck({ document_id: documentId, license_id: licenseId ?? null }, true)) as { results: (DocCheck & { document_id: string })[] } | null,
  /** Ιστορικό ελέγχων μιας αίτησης (τελευταίος ανά έγγραφο πρώτα) */
  checks: async (licenseId: string) => unwrap(await q.from('document_checks').select('*').eq('license_id', licenseId).order('checked_at', { ascending: false })) as Promise<{ id: string; document_id: string; doc_type: string; status: string; confidence: number | null; issues: string[]; source: string; model: string | null; checked_at: string }[]>,
}
