import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ExperimentDetailPage from './pages/ExperimentDetailPage.jsx';
import ExperimentFormPage from './pages/ExperimentFormPage.jsx';
import ExperimentsPage from './pages/ExperimentsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import ResearcherDetailPage from './pages/ResearcherDetailPage.jsx';
import ResearchersPage from './pages/ResearchersPage.jsx';
import RunComparePage from './pages/RunComparePage.jsx';
import RunDetailPage from './pages/RunDetailPage.jsx';
import { EditRunPage, NewRunPage } from './pages/RunFormPage.jsx';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="experiments" element={<ExperimentsPage />} />
        <Route path="experiments/new" element={<ExperimentFormPage />} />
        <Route path="experiments/:id" element={<ExperimentDetailPage />} />
        <Route path="experiments/:id/edit" element={<ExperimentFormPage />} />
        <Route path="experiments/:id/runs/new" element={<NewRunPage />} />
        <Route path="experiments/:id/compare" element={<RunComparePage />} />
        <Route path="runs/:id" element={<RunDetailPage />} />
        <Route path="runs/:id/edit" element={<EditRunPage />} />
        <Route path="researchers" element={<ResearchersPage />} />
        <Route path="researchers/:id" element={<ResearcherDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
