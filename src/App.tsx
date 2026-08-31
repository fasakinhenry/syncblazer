import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext.tsx";
import { ThemeProvider } from "@/context/ThemeContext.tsx";
import { ToastProvider } from "@/context/ToastContext.tsx";
import { SocketProvider } from "@/context/SocketContext.tsx";
import { RoomProvider } from "@/context/RoomContext.tsx";
import { PeerTransferProvider } from "@/context/PeerTransferContext.tsx";
import { ProtectedRoute, GuestRoute, PublicRoute } from "@/components/ProtectedRoute.tsx";
import { AppShell } from "@/components/layout/AppShell.tsx";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { LandingPage } from "@/pages/landing/LandingPage.tsx";
import { PublicNotePage } from "@/pages/PublicNotePage.tsx";
import { LoginPage } from "@/pages/auth/LoginPage.tsx";
import { RegisterPage } from "@/pages/auth/RegisterPage.tsx";
import { NotFoundPage } from "@/pages/NotFoundPage.tsx";

const RoomPage = lazy(() => import("@/pages/RoomPage.tsx").then((m) => ({ default: m.RoomPage })));
const RoomDetailPage = lazy(() => import("@/pages/RoomDetailPage.tsx").then((m) => ({ default: m.RoomDetailPage })));
const NotesPage = lazy(() => import("@/pages/NotesPage.tsx").then((m) => ({ default: m.NotesPage })));
const QuickBlazePage = lazy(() => import("@/pages/QuickBlazePage.tsx").then((m) => ({ default: m.QuickBlazePage })));
const DevicesPage = lazy(() => import("@/pages/DevicesPage.tsx").then((m) => ({ default: m.DevicesPage })));
const TransfersPage = lazy(() => import("@/pages/TransfersPage.tsx").then((m) => ({ default: m.TransfersPage })));
const ProfilePage = lazy(() => import("@/pages/ProfilePage.tsx").then((m) => ({ default: m.ProfilePage })));

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <SocketProvider>
              <RoomProvider>
                <PeerTransferProvider>
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
                      </Route>
                    </Route>

                    <Route path="/n/:token" element={<PublicNotePage />} />

                    <Route path="/404" element={<NotFoundPage />} />
                    <Route path="*" element={<Navigate to="/404" replace />} />
                  </Routes>
                  <PwaUpdatePrompt />
                </PeerTransferProvider>
              </RoomProvider>
            </SocketProvider>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
