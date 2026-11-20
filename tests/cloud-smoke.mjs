import { createClient } from '@supabase/supabase-js'
const url='https://eqhlrkbdymyejjigducv.supabase.co', key=process.env.KEY
const anon = createClient(url, key, { auth:{persistSession:false} })
const t = async (name, fn) => { try { const r = await fn(); console.log('ok  ', name, r ?? '') } catch (e) { console.log('FAIL', name, e.message) } }
await t('anon public_competitions', async()=>{ const {data,error}=await anon.from('public_competitions').select('name,status'); if(error) throw error; return data.length })
await t('anon cannot read licenses', async()=>{ const {error}=await anon.from('licenses').select('id').limit(1); if(!error) throw new Error('readable!'); return error.code })
await t('anon cannot rpc post_charge', async()=>{ const {error}=await anon.rpc('post_charge',{p_org:'00000000-0000-0000-0000-000000000000',p_club:'00000000-0000-0000-0000-000000000000',p_fee_type:'00000000-0000-0000-0000-000000000000',p_amount:1}); if(!error) throw new Error('callable!'); return error.code })
for (const [em, what] of [['admin@esna-demo.gr','union A'],['admin@esba-demo.gr','union B']]) {
  const c = createClient(url, key, { auth:{persistSession:false} })
  await t(`login ${em}`, async()=>{ const {data,error}=await c.auth.signInWithPassword({email:em,password:'demo1234'}); if(error) throw error; return data.user.id.slice(0,8) })
  await t(`${what} memberships`, async()=>{ const {data,error}=await c.from('org_members').select('role, org:organizations(short_name)'); if(error) throw error; return JSON.stringify(data) })
  await t(`${what} visible licenses by org`, async()=>{ const {data,error}=await c.from('licenses').select('org_id'); if(error) throw error; const m={}; for(const r of data) m[r.org_id]=(m[r.org_id]||0)+1; return JSON.stringify(m) })
  await t(`${what} balances`, async()=>{ const {data,error}=await c.from('account_balances').select('club_name,balance').gt('balance',0); if(error) throw error; return data.length+' debtors' })
}
