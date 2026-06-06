import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute({ allowedRoles }: { allowedRoles?: string[] }) {
  const { user, role, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    // Redirect to their respective home page if they try to access unauthorized routes
    if (role === 'Admin') return <Navigate to="/admin" replace />;
    if (role === 'Donor') return <Navigate to="/donor" replace />;
    if (role === 'Patient') return <Navigate to="/patient" replace />;
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
