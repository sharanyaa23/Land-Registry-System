import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

/**
 * Role-based route guard.
 * Redirects users to their correct dashboard if they try to access a role they don't have.
 * Officers are pre-whitelisted — they land here automatically after wallet connect.
 *
 * Usage:
 *   <Route path="/seller/*" element={<RoleGuard allowed={['seller']}><SellerPage /></RoleGuard>} />
 */
const RoleGuard = ({ allowed, children }) => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0c0e14' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#7C5CFF] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[#9ca3af] text-sm font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const userRole = user?.role;

  // If user's role is not in the allowed list, redirect to their correct dashboard
  if (!allowed.includes(userRole)) {
    const roleRoutes = {
      buyer: '/buyer',
      seller: '/seller',
      officer: '/officer',
      admin: '/officer' // admins share officer dashboard
    };
    return <Navigate to={roleRoutes[userRole] || '/'} replace />;
  }

  return children;
};

export default RoleGuard;
