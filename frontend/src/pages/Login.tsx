import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, User as UserIcon, Activity } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

type Role = 'Admin' | 'Donor' | 'Patient';

export function Login() {
  const [activeTab, setActiveTab] = useState<Role>('Donor');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleDemoLogin = (role: Role) => {
    setEmail(`${role.toLowerCase()}@demo.com`);
    setPassword(`${role}123!`);
    setActiveTab(role);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/api/auth/login', { email, password });
      const { access_token, role, sub } = response.data;
      
      if (role !== activeTab && role !== 'Admin') { // Admins can login to any tab, others strictly to their tab
         setError(`This account is registered as a ${role}, not a ${activeTab}.`);
         setIsLoading(false);
         return;
      }
      
      // We pass some basic user data, the AuthContext will fetch full profile
      login(access_token, role, { email, role, sub });
      
      // Redirect based on role
      if (role === 'Admin') navigate('/admin');
      else if (role === 'Donor') navigate('/donor');
      else navigate('/patient');
      
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center transform rotate-12 shadow-xl">
             <Activity className="w-10 h-10 text-white transform -rotate-12" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900 tracking-tight">
          PulseNet
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Sign in to your account
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          
          {/* Role Tabs */}
          <div className="flex space-x-2 mb-8 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('Donor')}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-md flex items-center justify-center transition-colors ${
                activeTab === 'Donor' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <UserIcon className="w-4 h-4 mr-2" />
              Donor
            </button>
            <button
              onClick={() => setActiveTab('Patient')}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-md flex items-center justify-center transition-colors ${
                activeTab === 'Patient' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Activity className="w-4 h-4 mr-2" />
              Patient
            </button>
            <button
              onClick={() => setActiveTab('Admin')}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-md flex items-center justify-center transition-colors ${
                activeTab === 'Admin' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Shield className="w-4 h-4 mr-2" />
              Admin
            </button>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm">
                <a href="#" className="font-medium text-red-600 hover:text-red-500">
                  Forgot your password?
                </a>
              </div>
              <div className="text-sm">
                <a href="/register" className="font-medium text-slate-600 hover:text-slate-900">
                  Don't have an account? Sign up
                </a>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">Demo Quick Login</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <button onClick={() => handleDemoLogin('Donor')} className="w-full flex justify-center py-2 px-4 border border-slate-300 rounded-md shadow-sm bg-white text-sm font-medium text-slate-500 hover:bg-slate-50">Donor</button>
              <button onClick={() => handleDemoLogin('Patient')} className="w-full flex justify-center py-2 px-4 border border-slate-300 rounded-md shadow-sm bg-white text-sm font-medium text-slate-500 hover:bg-slate-50">Patient</button>
              <button onClick={() => handleDemoLogin('Admin')} className="w-full flex justify-center py-2 px-4 border border-slate-300 rounded-md shadow-sm bg-white text-sm font-medium text-slate-500 hover:bg-slate-50">Admin</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
