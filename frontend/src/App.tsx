import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { Login } from "./pages/Login";
import { PlanningDashboard } from "./pages/PlanningDashboard";
import { Audits } from "./pages/Audits";
import { AuditDetailPage } from "./pages/AuditDetailPage";
import { Auditors } from "./pages/Auditors";
import { PrestationCompanies } from "./pages/PrestationCompanies";
import { Templates } from "./pages/Templates";
import { Users } from "./pages/Users";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<Layout><PlanningDashboard /></Layout>} />
        <Route path="/audits" element={<Layout><Audits /></Layout>} />
        <Route path="/audits/:id" element={<Layout><AuditDetailPage /></Layout>} />
        <Route path="/auditors" element={<Layout><Auditors /></Layout>} />
        <Route path="/prestation-companies" element={<Layout><PrestationCompanies /></Layout>} />
        <Route path="/templates" element={<Layout><Templates /></Layout>} />
      </Route>

      <Route element={<RequireAuth roles={["admin"]} />}>
        <Route path="/users" element={<Layout><Users /></Layout>} />
      </Route>
    </Routes>
  );
}
