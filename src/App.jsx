import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
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
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Main chat interface (original app) */}
        <Route path="/" element={<ChatPage />} />

        {/* Employee-facing pages */}
        <Route path="/knowledge-base" element={
          <div className="employee-page-wrapper">
            <nav className="employee-nav">
              <Link to="/" className="btn btnTiny">Chat</Link>
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
              <Link to="/" className="btn btnTiny">Chat</Link>
              <Link to="/knowledge-base" className="btn btnTiny">Knowledge Base</Link>
              <Link to="/announcements" className="btn btnTiny">Announcements</Link>
              <Link to="/guided-paths" className="btn btnTiny">Guided Paths</Link>
              <Link to="/manager" className="btn btnTiny btnGhost">Manager</Link>
              <Link to="/admin" className="btn btnTiny btnGhost">HR Portal</Link>
            </nav>
            <EmployeeAnnouncements />
          </div>
        } />

        {/* Guided Paths — explore/browse */}
        <Route path="/guided-paths" element={
          <div className="employee-page-wrapper">
            <nav className="employee-nav">
              <Link to="/" className="btn btnTiny">Chat</Link>
              <Link to="/knowledge-base" className="btn btnTiny">Knowledge Base</Link>
              <Link to="/announcements" className="btn btnTiny">Announcements</Link>
              <Link to="/guided-paths" className="btn btnTiny">Guided Paths</Link>
              <Link to="/manager" className="btn btnTiny btnGhost">Manager</Link>
              <Link to="/admin" className="btn btnTiny btnGhost">HR Portal</Link>
            </nav>
            <GuidedPathExplore />
          </div>
        } />

        {/* Guided Path Runner (employee-facing) */}
        <Route path="/guided-paths/:moduleId" element={
          <div className="employee-page-wrapper">
            <nav className="employee-nav">
              <Link to="/" className="btn btnTiny">Chat</Link>
              <Link to="/knowledge-base" className="btn btnTiny">Knowledge Base</Link>
              <Link to="/announcements" className="btn btnTiny">Announcements</Link>
              <Link to="/guided-paths" className="btn btnTiny">Guided Paths</Link>
              <Link to="/manager" className="btn btnTiny btnGhost">Manager</Link>
              <Link to="/admin" className="btn btnTiny btnGhost">HR Portal</Link>
            </nav>
            <GuidedPathRunner />
          </div>
        } />

        {/* Manager Portal */}
        <Route path="/manager" element={<ManagerLayout />}>
          <Route index element={<ManagerDashboard />} />
          <Route path="team" element={<ManagerTeam />} />
          <Route path="coaching" element={<ManagerCoaching />} />
          <Route path="toolkit" element={<ManagerToolkit />} />
        </Route>

        {/* Admin HR Portal */}
        <Route path="/admin" element={<AdminLayout />}>
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
