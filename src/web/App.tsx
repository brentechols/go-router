import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { RouteEditorPage } from "./pages/RouteEditorPage";
import { RouteListPage } from "./pages/RouteListPage";

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route index element={<RouteListPage />} />
        <Route path="new" element={<RouteEditorPage mode="create" />} />
        <Route path="routes/:id/edit" element={<RouteEditorPage mode="edit" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
