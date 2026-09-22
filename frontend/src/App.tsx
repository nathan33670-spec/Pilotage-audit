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
import { Statistics } from "./pages/Statistics";
import { ImportTI } from "./pages/ImportTI";
import { AdminPanel } from "./pages/AdminPanel";
import { Documentation } from "./pages/Documentation";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<Layout><PlanningDashboard /></Layout>} />
        <Route path="/audits" element={<Layout><Audits /></Layout>} />
        <Route path="/audits/:id" element={<Layout><AuditDetailPage /></Layout>} />
        <Route path="/statistiques" element={<Layout><Statistics /></Layout>} />
        <Route path="/auditors" element={<Layout><Auditors /></Layout>} />
        <Route path="/prestation-companies" element={<Layout><PrestationCompanies /></Layout>} />
        <Route path="/templates" element={<Layout><Templates /></Layout>} />
        <Route path="/documentation" element={<Layout><Documentation /></Layout>} />
      </Route>

      <Route element={<RequireAuth roles={["admin", "pilote_audit"]} />}>
        <Route path="/import" element={<Layout><ImportTI /></Layout>} />
      </Route>

      <Route element={<RequireAuth roles={["admin"]} />}>
        <Route path="/administration" element={<Layout><AdminPanel /></Layout>} />
        <Route path="/users" element={<Layout><Users /></Layout>} />
      </Route>
    </Routes>
  );
}
