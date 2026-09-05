import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider } from "@/context/AuthContext.tsx";
import { ThemeProvider } from "@/context/ThemeContext.tsx";
import { ToastProvider } from "@/context/ToastContext.tsx";
import { SocketProvider } from "@/context/SocketContext.tsx";
import { RoomProvider } from "@/context/RoomContext.tsx";
import { PeerTransferProvider } from "@/context/PeerTransferContext.tsx";
import { LocalSessionProvider } from "@/context/LocalSessionContext.tsx";
import { QuickPairProvider } from "@/context/QuickPairContext.tsx";
import { LanPairProvider } from "@/context/LanPairContext.tsx";
import { ProtectedRoute, GuestRoute, PublicRoute, AdminRoute } from "@/components/ProtectedRoute.tsx";
import { AppShell } from "@/components/layout/AppShell.tsx";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt.tsx";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { LandingPage } from "@/pages/landing/LandingPage.tsx";
import { PublicNotePage } from "@/pages/PublicNotePage.tsx";
import { PublicProfilePage } from "@/pages/PublicProfilePage.tsx";
import { LoginPage } from "@/pages/auth/LoginPage.tsx";
import { RegisterPage } from "@/pages/auth/RegisterPage.tsx";
import { NotFoundPage } from "@/pages/NotFoundPage.tsx";

const RoomPage = lazy(() => import("@/pages/RoomPage.tsx").then((m) => ({ default: m.RoomPage })));
const LocalSessionPage = lazy(() => import("@/pages/LocalSessionPage.tsx").then((m) => ({ default: m.LocalSessionPage })));
const RoomDetailPage = lazy(() => import("@/pages/RoomDetailPage.tsx").then((m) => ({ default: m.RoomDetailPage })));
const NotesPage = lazy(() => import("@/pages/NotesPage.tsx").then((m) => ({ default: m.NotesPage })));
const QuickBlazePage = lazy(() => import("@/pages/QuickBlazePage.tsx").then((m) => ({ default: m.QuickBlazePage })));
const DevicesPage = lazy(() => import("@/pages/DevicesPage.tsx").then((m) => ({ default: m.DevicesPage })));
const TransfersPage = lazy(() => import("@/pages/TransfersPage.tsx").then((m) => ({ default: m.TransfersPage })));
const ProfilePage = lazy(() => import("@/pages/ProfilePage.tsx").then((m) => ({ default: m.ProfilePage })));
const AdminPage = lazy(() => import("@/pages/admin/AdminPage.tsx").then((m) => ({ default: m.AdminPage })));
const LocalTransferHubPage = lazy(() =>
  import("@/pages/LocalTransferHubPage.tsx").then((m) => ({ default: m.LocalTransferHubPage }))
);
const QuickConnectPage = lazy(() => import("@/pages/QuickConnectPage.tsx").then((m) => ({ default: m.QuickConnectPage })));
const LanConnectPage = lazy(() => import("@/pages/LanConnectPage.tsx").then((m) => ({ default: m.LanConnectPage })));

export default function App() {
  return (
    <ThemeProvider>
      <Analytics />
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <SocketProvider>
              <RoomProvider>
                <PeerTransferProvider>
                  <LocalSessionProvider>
                  <QuickPairProvider>
                  <LanPairProvider>
                  <Routes>
                    <Route element={<PublicRoute />}>
                      <Route path="/" element={<LandingPage />} />
                    </Route>

                    <Route element={<GuestRoute />}>
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/register" element={<RegisterPage />} />
                    </Route>

                    <Route element={<ProtectedRoute />}>
                      <Route element={<AppShell />}>
                        <Route
                          path="/room"
                          element={
                            <Suspense fallback={<PageSpinner />}>
                              <RoomPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="/local-session"
                          element={
                            <Suspense fallback={<PageSpinner />}>
                              <LocalSessionPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="/local-transfer"
                          element={
                            <Suspense fallback={<PageSpinner />}>
                              <LocalTransferHubPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="/quick-connect"
                          element={
                            <Suspense fallback={<PageSpinner />}>
                              <QuickConnectPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="/lan-connect"
                          element={
                            <Suspense fallback={<PageSpinner />}>
                              <LanConnectPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="/rooms/:roomId"
                          element={
                            <Suspense fallback={<PageSpinner />}>
                              <RoomDetailPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="/notes"
                          element={
                            <Suspense fallback={<PageSpinner />}>
                              <NotesPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="/blaze"
                          element={
                            <Suspense fallback={<PageSpinner />}>
                              <QuickBlazePage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="/devices"
                          element={
                            <Suspense fallback={<PageSpinner />}>
                              <DevicesPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="/transfers"
                          element={
                            <Suspense fallback={<PageSpinner />}>
                              <TransfersPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="/profile"
                          element={
                            <Suspense fallback={<PageSpinner />}>
                              <ProfilePage />
                            </Suspense>
                          }
                        />
                        <Route element={<AdminRoute />}>
                          <Route
                            path="/admin"
                            element={
                              <Suspense fallback={<PageSpinner />}>
                                <AdminPage />
                              </Suspense>
                            }
                          />
                        </Route>
                      </Route>
                    </Route>

                    <Route path="/n/:token" element={<PublicNotePage />} />
                    <Route path="/u/:userId" element={<PublicProfilePage />} />

                    <Route path="/404" element={<NotFoundPage />} />
                    <Route path="*" element={<Navigate to="/404" replace />} />
                  </Routes>
                  <AnalyticsBeacon />
                  <PwaUpdatePrompt />
                  </LanPairProvider>
                  </QuickPairProvider>
                  </LocalSessionProvider>
                </PeerTransferProvider>
              </RoomProvider>
            </SocketProvider>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
