import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import AdminLayout from "./components/AdminLayout.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminKnowledgeBase from "./pages/AdminKnowledgeBase.jsx";
import AdminAnnouncements from "./pages/AdminAnnouncements.jsx";
import AdminEmployees from "./pages/AdminEmployees.jsx";
import AdminEmployeeDetail from "./pages/AdminEmployeeDetail.jsx";
import AdminGuidedPaths from "./pages/AdminGuidedPaths.jsx";
import AdminOrgConfig from "./pages/AdminOrgConfig.jsx";
import AdminManagerConfig from "./pages/AdminManagerConfig.jsx";
import EmployeeKnowledgeBase from "./pages/EmployeeKnowledgeBase.jsx";
import EmployeeAnnouncements from "./pages/EmployeeAnnouncements.jsx";
import GuidedPathExplore from "./pages/GuidedPathExplore.jsx";
import GuidedPathRunner from "./pages/GuidedPathRunner.jsx";
import ManagerLayout from "./components/ManagerLayout.jsx";
import ManagerDashboard from "./pages/ManagerDashboard.jsx";
import ManagerTeam from "./pages/ManagerTeam.jsx";
import ManagerCoaching from "./pages/ManagerCoaching.jsx";
import ManagerToolkit from "./pages/ManagerToolkit.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import HRAdminLoginPage from "./pages/HRAdminLoginPage.jsx";
import EmployeeLoginPage from "./pages/EmployeeLoginPage.jsx";
import SuperAdminLayout from "./components/SuperAdminLayout.jsx";
import SuperAdminDashboard from "./pages/SuperAdminDashboard.jsx";
import SuperAdminOrgDetail from "./pages/SuperAdminOrgDetail.jsx";
import AuthGuard from "./components/AuthGuard.jsx";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login pages */}
        <Route path="/login" element={<EmployeeLoginPage />} />
        <Route path="/super-admin/login" element={<LoginPage />} />
        <Route path="/admin/login" element={<HRAdminLoginPage />} />

        {/* Landing page */}
        <Route path="/" element={<LandingPage />} />

        {/* Main chat interface (employee) */}
        <Route path="/chat" element={<ChatPage />} />

        {/* Employee-facing pages */}
        <Route path="/knowledge-base" element={
          <div className="employee-page-wrapper">
            <nav className="employee-nav">
              <Link to="/chat" className="btn btnTiny">Chat</Link>
              <Link to="/knowledge-base" className="btn btnTiny">Knowledge Base</Link>
              <Link to="/announcements" className="btn btnTiny">Announcements</Link>
              <Link to="/guided-paths" className="btn btnTiny">Guided Paths</Link>
              <Link to="/manager" className="btn btnTiny btnGhost">Manager</Link>
              <Link to="/admin" className="btn btnTiny btnGhost">HR Portal</Link>
            </nav>
            <EmployeeKnowledgeBase />
          </div>
        } />
        <Route path="/announcements" element={
          <div className="employee-page-wrapper">
            <nav className="employee-nav">
              <Link to="/chat" className="btn btnTiny">Chat</Link>
              <Link to="/knowledge-base" className="btn btnTiny">Knowledge Base</Link>
              <Link to="/announcements" className="btn btnTiny">Announcements</Link>
              <Link to="/guided-paths" className="btn btnTiny">Guided Paths</Link>
              <Link to="/manager" className="btn btnTiny btnGhost">Manager</Link>
              <Link to="/admin" className="btn btnTiny btnGhost">HR Portal</Link>
            </nav>
            <EmployeeAnnouncements />
          </div>
        } />

        {/* Guided Paths */}
        <Route path="/guided-paths" element={
          <div className="employee-page-wrapper">
            <nav className="employee-nav">
              <Link to="/chat" className="btn btnTiny">Chat</Link>
              <Link to="/knowledge-base" className="btn btnTiny">Knowledge Base</Link>
              <Link to="/announcements" className="btn btnTiny">Announcements</Link>
              <Link to="/guided-paths" className="btn btnTiny">Guided Paths</Link>
              <Link to="/manager" className="btn btnTiny btnGhost">Manager</Link>
              <Link to="/admin" className="btn btnTiny btnGhost">HR Portal</Link>
            </nav>
            <GuidedPathExplore />
          </div>
        } />
        <Route path="/guided-paths/:moduleId" element={
          <div className="employee-page-wrapper">
            <nav className="employee-nav">
              <Link to="/chat" className="btn btnTiny">Chat</Link>
              <Link to="/knowledge-base" className="btn btnTiny">Knowledge Base</Link>
              <Link to="/announcements" className="btn btnTiny">Announcements</Link>
              <Link to="/guided-paths" className="btn btnTiny">Guided Paths</Link>
              <Link to="/manager" className="btn btnTiny btnGhost">Manager</Link>
              <Link to="/admin" className="btn btnTiny btnGhost">HR Portal</Link>
            </nav>
            <GuidedPathRunner />
          </div>
        } />

        {/* Super Admin Portal */}
        <Route path="/super-admin" element={
          <AuthGuard requiredRoles={["super_admin"]} loginPath="/super-admin/login">
            <SuperAdminLayout />
          </AuthGuard>
        }>
          <Route index element={<SuperAdminDashboard />} />
          <Route path="orgs/:orgId" element={<SuperAdminOrgDetail />} />
        </Route>

        {/* Manager Portal */}
        <Route path="/manager" element={
          <AuthGuard requiredRoles={["manager", "hr_admin", "super_admin"]} loginPath="/admin/login">
            <ManagerLayout />
          </AuthGuard>
        }>
          <Route index element={<ManagerDashboard />} />
          <Route path="team" element={<ManagerTeam />} />
          <Route path="coaching" element={<ManagerCoaching />} />
          <Route path="toolkit" element={<ManagerToolkit />} />
        </Route>

        {/* Admin HR Portal */}
        <Route path="/admin" element={
          <AuthGuard requiredRoles={["hr_admin", "super_admin"]} loginPath="/admin/login">
            <AdminLayout />
          </AuthGuard>
        }>
          <Route index element={<AdminDashboard />} />
          <Route path="knowledge-base" element={<AdminKnowledgeBase />} />
          <Route path="announcements" element={<AdminAnnouncements />} />
          <Route path="employees" element={<AdminEmployees />} />
          <Route path="employees/:userId" element={<AdminEmployeeDetail />} />
          <Route path="guided-paths" element={<AdminGuidedPaths />} />
          <Route path="org-config" element={<AdminOrgConfig />} />
          <Route path="managers" element={<AdminManagerConfig />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
