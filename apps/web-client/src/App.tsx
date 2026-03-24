import React from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import HomePage from "./pages/HomePage";
import PlanPage from "./pages/PlanPage";
import TripPage from "./pages/TripPage";
import TripsPage from "./pages/TripsPage";
import SettingsPage from "./pages/SettingsPage";
import OpsPage from "./pages/OpsPage";
import ShareTripPage from "./pages/ShareTripPage";

function MainShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isOps = location.pathname === "/ops";
  const isShare = location.pathname.startsWith("/share/");

  if (isOps || isShare) {
    return <>{children}</>;
  }

  return (
    <div className="page-shell">
      <header className="global-nav">
        <NavLink className="brand" to="/">
          <span className="brand-badge">TC</span>
          <span className="brand-label">
            <strong>Trip Canvas</strong>
            <span>AI 自由行规划助手</span>
          </span>
        </NavLink>

        <nav className="nav-links">
          <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/">
            首页
          </NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/plan">
            开始规划
          </NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/trips">
            我的行程
          </NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/settings">
            偏好设置
          </NavLink>
        </nav>
      </header>
      {children}
    </div>
  );
}

export default function App() {
  return (
    <>
      <MainShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/trip" element={<TripPage />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/ops" element={<OpsPage />} />
          <Route path="/share/:token" element={<ShareTripPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MainShell>
      <div className="toast-zone" id="toastZone"></div>
    </>
  );
}

