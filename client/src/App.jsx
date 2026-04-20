import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import RoleGuard from './components/shared/RoleGuard.jsx';
import LandingPage from './components/pages/LandingPage.jsx';
import MainDashboard from './components/pages/MainDashboard.jsx';
import BuyerPage from './components/buyer/BuyerPage.jsx';
import SellerPage from './components/seller/SellerPage.jsx';
import OfficerPage from './components/officer/OfficerPage.jsx';
import DocumentsPage from './components/buyer/DocumentsPage.jsx';
import TransfersPage from './components/buyer/TransfersPage.jsx';
import SellerDocumentsPage from './components/seller/SellerDocumentsPage.jsx';
import SellerTransfersPage from './components/seller/SellerTransfersPage.jsx';
import OfficerDocumentsPage from './components/officer/OfficerDocumentsPage.jsx';
import CasesPage from './components/officer/CasesPage.jsx';
import './tailwind.css';

// ── Auto-redirect authenticated users from / to their dashboard ────
const SmartLanding = () => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center" style={{ backgroundColor: '#0c0e14' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-on-surface-variant font-label text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  // Already authenticated → redirect to main dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <LandingPage />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SmartLanding />} />
      <Route path="/dashboard" element={<MainDashboard />} />

      {/* Buyer routes — buyer and seller can access */}
      <Route path="/buyer" element={<RoleGuard allowed={['buyer', 'seller']}><BuyerPage /></RoleGuard>} />
      <Route path="/buyer/documents" element={<RoleGuard allowed={['buyer', 'seller']}><DocumentsPage /></RoleGuard>} />
      <Route path="/buyer/transfers" element={<RoleGuard allowed={['buyer', 'seller']}><TransfersPage /></RoleGuard>} />

      {/* Seller routes — buyer and seller can access */}
      <Route path="/seller" element={<RoleGuard allowed={['buyer', 'seller']}><SellerPage /></RoleGuard>} />
      <Route path="/seller/documents" element={<RoleGuard allowed={['buyer', 'seller']}><SellerDocumentsPage /></RoleGuard>} />
      <Route path="/seller/transfers" element={<RoleGuard allowed={['buyer', 'seller']}><SellerTransfersPage /></RoleGuard>} />

      {/* Officer routes — officer + admin */}
      <Route path="/officer" element={<RoleGuard allowed={['officer', 'admin']}><OfficerPage /></RoleGuard>} />
      <Route path="/officer/documents" element={<RoleGuard allowed={['officer', 'admin']}><OfficerDocumentsPage /></RoleGuard>} />
      <Route path="/officer/cases" element={<RoleGuard allowed={['officer', 'admin']}><CasesPage /></RoleGuard>} />

      {/* Legacy routes → redirect to role-appropriate routes */}
      <Route path="/documents" element={<Navigate to="/buyer/documents" replace />} />
      <Route path="/transfers" element={<Navigate to="/buyer/transfers" replace />} />
      <Route path="/cases" element={<Navigate to="/officer/cases" replace />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="dark">
          <AppRoutes />
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
