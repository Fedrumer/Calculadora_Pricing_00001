import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Index from './pages/Index'
import Historico from './pages/Historico'
import Testes from './pages/Testes'
import NotFound from './pages/NotFound'
import Layout from './components/Layout'
import Login from './pages/Login'
import { AuthProvider, useAuth, Role } from '@/hooks/use-auth'
import Admin from './pages/Admin'
import Coberturas from './pages/admin/Coberturas'
import Forbidden from './pages/Forbidden'
import { CotacaoProvider } from '@/stores/useCotacaoStore'

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { isAutenticado, status } = useAuth()
  if (status === 'loading') return null
  if (!isAutenticado()) return <Navigate to="/login" replace />
  return <>{children}</>
}

const RequireRole = ({ role, children }: { role: Role | Role[]; children: React.ReactNode }) => {
  const { temRole, status } = useAuth()
  if (status === 'loading') return null
  const roles = Array.isArray(role) ? role : [role]
  if (!roles.some((r) => temRole(r))) return <Navigate to="/forbidden" replace />
  return <>{children}</>
}

const GuestOnly = ({ children }: { children: React.ReactNode }) => {
  const { isAutenticado, status } = useAuth()
  if (status === 'loading') return null
  if (isAutenticado()) return <Navigate to="/cotacao" replace />
  return <>{children}</>
}

const App = () => (
  <AuthProvider>
    <BrowserRouter future={{ v7_startTransition: false, v7_relativeSplatPath: false }}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route
            path="/login"
            element={
              <GuestOnly>
                <Login />
              </GuestOnly>
            }
          />
          <Route
            path="/forbidden"
            element={
              <RequireAuth>
                <Forbidden />
              </RequireAuth>
            }
          />
          <Route
            element={
              <RequireAuth>
                <CotacaoProvider>
                  <Layout />
                </CotacaoProvider>
              </RequireAuth>
            }
          >
            <Route path="/" element={<Navigate to="/cotacao" replace />} />
            <Route
              path="/cotacao"
              element={
                <RequireRole role={['COMERCIAL', 'ADMIN']}>
                  <Index />
                </RequireRole>
              }
            />
            <Route
              path="/historico"
              element={
                <RequireRole role={['COMERCIAL', 'ADMIN']}>
                  <Historico />
                </RequireRole>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireRole role="ADMIN">
                  <Admin />
                </RequireRole>
              }
            />
            <Route
              path="/admin/coberturas"
              element={
                <RequireRole role="ADMIN">
                  <Coberturas />
                </RequireRole>
              }
            />
            <Route path="/testes" element={<Testes />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  </AuthProvider>
)

export default App
