import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Toast } from '@/components/ui'

const Ctx = createContext<(m: string) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const show = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000) }, [])
  return <Ctx.Provider value={show}>{children}<Toast msg={msg} /></Ctx.Provider>
}
export const useToast = () => useContext(Ctx)
