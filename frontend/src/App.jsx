import React, { useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import Navbar from './components/Navbar';
import { DataContext, DataProvider } from './context/DataContext';
import Dashboard from './pages/Dashboard';
import MailDashboard from './pages/MailDashboard';
import MeetingDashboard from './pages/MeetingDashboard';
import StorageDashboard from './pages/StorageDashboard';
import OthersDashboard from './pages/OthersDashboard';
import ReportPage from './pages/ReportPage';
import Login from './pages/Login';

function App() {
  return (
    <DataProvider>
      <AppShell />
    </DataProvider>
  );
}

function AppShell() {
  const {
    authenticatedUser,
    setAuthenticatedUser,
    gmailEmail,
    setGmailEmail,
    outlookEmail,
    setOutlookEmail,
    loading,
    error,
  } = useContext(DataContext);

  const [searchParams] = useSearchParams();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const provider = searchParams.get('provider');
    const email = searchParams.get('email');
    const name = searchParams.get('name');
    const id = searchParams.get('id');
    if (provider && email) {
      console.log('[App] Setting authenticated user:', { provider, email, name });
      setAuthenticatedUser({
        email,
        name: decodeURIComponent(name || ''),
        provider,
        id,
      });
      if (provider === 'google') {
        setGmailEmail(email);
      } else if (provider === 'microsoft') {
        setOutlookEmail(email);
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams, setAuthenticatedUser, setGmailEmail, setOutlookEmail]);

  if (!authenticatedUser) {
    return <Login />;
  }

  return (
    <div className="app-shell">
      <div className="container">
        <Navbar
          authenticatedUser={authenticatedUser}
          gmailEmail={gmailEmail}
          onChangeGmail={setGmailEmail}
          outlookEmail={outlookEmail}
          onChangeOutlook={setOutlookEmail}
          isAdmin={isAdmin}
          onToggleAdmin={() => setIsAdmin(!isAdmin)}
        />
        {error && (
          <div
            className="surface-card"
            style={{ marginBottom: 16, border: '1px solid rgba(231, 76, 60, 0.35)', color: '#e74c3c' }}
          >
            {error}
          </div>
        )}
        {loading && <div className="section-block" style={{ marginBottom: 16 }}>Loading latest activity…</div>}
        <div className="section-block">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/mail" element={<MailDashboard />} />
            <Route path="/meetings" element={<MeetingDashboard />} />
            <Route path="/storage" element={<StorageDashboard />} />
            <Route path="/others" element={<OthersDashboard />} />
            <Route path="/reports" element={<ReportPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default App;
