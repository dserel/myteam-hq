import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'

export const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === '1'
const LOCAL_REST = import.meta.env.VITE_LOCAL_REST === '1'
const URL_ = LOCAL_REST ? window.location.origin : (import.meta.env.VITE_SUPABASE_URL as string)
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
export const SUPABASE_URL = URL_
export const SUPABASE_ANON_KEY = KEY

const TOKEN_KEY = 'dev_jwt'
export function getDevToken(): string | null { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } }
export function clearDevToken() { try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } }

/** Local-only: mint an HS256 JWT for a demo user (mirrors what GoTrue would issue). */
export async function devLogin(userId: string, email: string) {
  const secret = new TextEncoder().encode(import.meta.env.VITE_DEV_JWT_SECRET as string)
  const jwt = await new SignJWT({ role: 'authenticated', email })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime('7d').sign(secret)
  localStorage.setItem(TOKEN_KEY, jwt)
  return jwt
}

export function decodeJwt(token: string): { sub: string; email?: string; exp?: number } | null {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) } catch { return null }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Untyped schema on purpose for the MVP: the API layer (src/api) owns the shapes.
// When Supabase cloud is wired, `supabase gen types` can replace `any` with the generated Database type.
export type DB = any

function build(): SupabaseClient<DB> {
  if (DEV_AUTH) {
    return createClient<DB>(URL_, KEY, {
      accessToken: async () => getDevToken(),
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return createClient<DB>(URL_, KEY)
}

export const supabase = build()

/** Anonymous client for public pages (never carries a user token). */
export const publicClient = createClient<DB>(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
