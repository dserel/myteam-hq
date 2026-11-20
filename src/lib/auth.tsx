import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, DEV_AUTH, getDevToken, clearDevToken, decodeJwt } from './supabase'

export type Role = 'federation_admin' | 'union_admin' | 'secretary' | 'treasurer' | 'club_manager' | 'viewer'
export interface Membership {
  id: string; org_id: string; role: Role; club_org_id: string | null; can_access_sensitive: boolean
  org: { id: string; name: string; short_name: string | null; type: 'federation' | 'union' | 'club'; parent_id: string | null; slug: string | null }
  club?: { id: string; name: string } | null
}
export interface AuthUser { id: string; email: string; full_name?: string }

interface AuthCtx {
  loading: boolean
  user: AuthUser | null
  memberships: Membership[]
  current: Membership | null
  setCurrent: (id: string) => void
  orgId: string | null
  role: Role | null
  clubId: string | null
  isStaff: boolean           // any non-club, non-viewer role
  isAdmin: boolean
  canWrite: boolean          // not viewer
  isTreasurer: boolean
  isFederation: boolean
  reload: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [currentId, setCurrentId] = useState<string | null>(() => { try { return localStorage.getItem('current_membership') } catch { return null } })

  async function loadUser(): Promise<AuthUser | null> {
    if (DEV_AUTH) {
      const t = getDevToken(); if (!t) return null
      const c = decodeJwt(t); if (!c || (c.exp && c.exp * 1000 < Date.now())) { clearDevToken(); return null }
      return { id: c.sub, email: c.email ?? '' }
    }
    const { data } = await supabase.auth.getUser()
    return data.user ? { id: data.user.id, email: data.user.email ?? '' } : null
  }

  async function reload() {
    setLoading(true)
    const u = await loadUser()
    setUser(u)
    if (!u) { setMemberships([]); setLoading(false); return }
    const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', u.id).maybeSingle()
    if (prof?.full_name) setUser({ ...u, full_name: prof.full_name })
    const { data } = await supabase.from('org_members')
      .select('id, org_id, role, club_org_id, can_access_sensitive, org:organizations!org_members_org_id_fkey(id,name,short_name,type,parent_id,slug), club:organizations!org_members_club_org_id_fkey(id,name)')
      .eq('user_id', u.id).eq('status', 'active')
    const ms = ((data ?? []) as unknown as Membership[])
    setMemberships(ms)
    setLoading(false)
  }

  useEffect(() => {
    reload()
    if (!DEV_AUTH) {
      const { data: sub } = supabase.auth.onAuthStateChange(() => { reload() })
      return () => sub.subscription.unsubscribe()
    }
  }, [])

  const current = useMemo(() => memberships.find(m => m.id === currentId) ?? memberships[0] ?? null, [memberships, currentId])

  const value: AuthCtx = useMemo(() => {
    const role = current?.role ?? null
    return {
      loading, user, memberships, current,
      setCurrent: (id) => { setCurrentId(id); try { localStorage.setItem('current_membership', id) } catch { /* ignore */ } },
      orgId: current?.org_id ?? null, role, clubId: current?.club_org_id ?? null,
      isStaff: !!role && !['club_manager', 'viewer'].includes(role),
      isAdmin: role === 'federation_admin' || role === 'union_admin',
      canWrite: !!role && role !== 'viewer',
      isTreasurer: role === 'treasurer' || role === 'federation_admin' || role === 'union_admin',
      isFederation: current?.org.type === 'federation',
      reload,
      signOut: async () => { if (DEV_AUTH) clearDevToken(); else await supabase.auth.signOut(); setUser(null); setMemberships([]) },
    }
  }, [loading, user, memberships, current])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
