import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import AppShell from '@/layout/AppShell'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Clubs from '@/pages/registry/Clubs'
import ClubDetail from '@/pages/registry/ClubDetail'
import Sections from '@/pages/registry/Sections'
import SectionDetail from '@/pages/registry/SectionDetail'
import Persons from '@/pages/registry/Persons'
import PersonDetail from '@/pages/registry/PersonDetail'
import HealthCards from '@/pages/registry/HealthCards'
import Licenses from '@/pages/licenses/Licenses'
import LicenseDetail from '@/pages/licenses/LicenseDetail'
import Transfers from '@/pages/transfers/Transfers'
import TransferNew from '@/pages/transfers/TransferNew'
import TransferDetail from '@/pages/transfers/TransferDetail'
import LicenseNew from '@/pages/licenses/LicenseNew'
import LicenseCard from '@/pages/licenses/LicenseCard'
import FinanceOverview from '@/pages/finance/Overview'
import Account from '@/pages/finance/Account'
import PriceList from '@/pages/finance/PriceList'
import Receipt from '@/pages/finance/Receipt'
import Competitions from '@/pages/competitions/Competitions'
import CompetitionDetail from '@/pages/competitions/CompetitionDetail'
import ImportWizard from '@/pages/import/ImportWizard'
import Members from '@/pages/admin/Members'
import Settings from '@/pages/admin/Settings'
import AcceptInvite from '@/pages/admin/AcceptInvite'
import PublicOrg from '@/pages/public/PublicOrg'
import PublicCompetition from '@/pages/public/PublicCompetition'
import Verify from '@/pages/public/Verify'
import Apply, { TrackLicense } from '@/pages/public/Apply'
import Embed from '@/pages/public/Embed'
import ShareImage from '@/pages/public/ShareImage'
import { Spinner } from '@/components/ui'

function Private({ children }: { children: React.ReactNode }) {
  const a = useAuth(); const loc = useLocation()
  if (a.loading) return <Spinner />
  if (!a.user) return <Navigate to="/login" state={{ from: loc }} replace />
  if (!a.current) return <div className="p-8 text-center text-sm text-slate-600">Ο λογαριασμός σας δεν έχει ρόλο σε κανέναν φορέα. / Your account has no role in any organization.</div>
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      {/* public, no login */}
      <Route path="/f/:orgSlug" element={<PublicOrg />} />
      <Route path="/f/:orgSlug/c/:slug" element={<PublicCompetition />} />
      <Route path="/v/:token" element={<Verify />} />
      <Route path="/apply/:token" element={<Apply />} />
      <Route path="/my/:token" element={<TrackLicense />} />
      <Route path="/embed/:competitionId" element={<Embed />} />
      <Route path="/share/:competitionId" element={<ShareImage />} />
      <Route path="/print/license/:id" element={<Private><LicenseCard /></Private>} />
      <Route path="/print/receipt/:id" element={<Private><Receipt /></Private>} />
      {/* app */}
      <Route element={<Private><AppShell /></Private>}>
        <Route index element={<Dashboard />} />
        <Route path="clubs" element={<Clubs />} />
        <Route path="clubs/:id" element={<ClubDetail />} />
        <Route path="sections" element={<Sections />} />
        <Route path="sections/:id" element={<SectionDetail />} />
        <Route path="persons" element={<Persons />} />
        <Route path="persons/:id" element={<PersonDetail />} />
        <Route path="health-cards" element={<HealthCards />} />
        <Route path="licenses" element={<Licenses />} />
        <Route path="licenses/new" element={<LicenseNew />} />
        <Route path="licenses/:id" element={<LicenseDetail />} />
        <Route path="transfers" element={<Transfers />} />
        <Route path="transfers/new" element={<TransferNew />} />
        <Route path="transfers/:id" element={<TransferDetail />} />
        <Route path="finance" element={<FinanceOverview />} />
        <Route path="finance/price-list" element={<PriceList />} />
        <Route path="finance/accounts/:id" element={<Account />} />
        <Route path="competitions" element={<Competitions />} />
        <Route path="competitions/:id" element={<CompetitionDetail />} />
        <Route path="import" element={<ImportWizard />} />
        <Route path="members" element={<Members />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
