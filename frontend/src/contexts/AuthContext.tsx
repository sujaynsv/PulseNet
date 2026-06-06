import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

type User = {
  id: number;
  role: string;
  email: string;
  name: string;
};

type AuthContextType = {
  user: User | null;
  role: string | null;
  token: string | null;
  login: (token: string, userRole: string, userData: any) => void;
  logout: () => void;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      if (token) {
        try {
          // In a real app, you might decode the JWT or fetch user details here
          // For now, we'll try to fetch the profile
          const { data } = await api.get('/api/auth/me');
          setUser(data);
          setRole(data.role);
        } catch (error) {
          console.error("Failed to load user session", error);
          logout();
        }
      }
      setIsLoading(false);
    };

    loadUser();
  }, [token]);

  const login = (newToken: string, newRole: string, userData: any) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setRole(newRole);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setRole(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
