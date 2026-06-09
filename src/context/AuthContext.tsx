import React, { createContext, useState, useContext, useEffect } from 'react';
import { AppUser, AuthContextType, AuthSession, ProfileUpdatePayload, UserRole } from '../types';
import { api, getStoredToken, setStoredToken } from '../lib/api';
import toast from 'react-hot-toast';

// Create Auth Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Local storage keys
const USER_STORAGE_KEY = 'business_nexus_user';
const RESET_TOKEN_KEY = 'business_nexus_reset_token';

// Auth Provider Component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for stored user on initial load
  useEffect(() => {
    const bootstrapSession = async () => {
      const token = getStoredToken();
      const storedUser = localStorage.getItem(USER_STORAGE_KEY);

      if (!token && storedUser) {
        setUser(JSON.parse(storedUser));
        setIsLoading(false);
        return;
      }

      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<AuthSession>('/auth/me');
        setUser(response.data.user);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.data.user));
      } catch {
        setStoredToken(null);
        localStorage.removeItem(USER_STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrapSession();
  }, []);

  const login = async (email: string, password: string, role: UserRole): Promise<void> => {
    setIsLoading(true);
    
    try {
      const response = await api.post<AuthSession>('/auth/login', {
        email,
        password,
        role,
      });

      setStoredToken(response.data.token);
      setUser(response.data.user);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.data.user));
      toast.success('Successfully logged in!');
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Unable to sign in';
      toast.error(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string, role: UserRole): Promise<void> => {
    setIsLoading(true);
    
    try {
      const response = await api.post<AuthSession>('/auth/register', {
        name,
        email,
        password,
        role,
      });

      setStoredToken(response.data.token);
      setUser(response.data.user);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.data.user));
      toast.success('Account created successfully!');
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Unable to create account';
      toast.error(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const forgotPassword = async (email: string): Promise<void> => {
    setIsLoading(true);

    try {
      const response = await api.post<{ message: string; resetToken?: string }>('/auth/forgot-password', {
        email,
      });

      if (response.data.resetToken) {
        localStorage.setItem(RESET_TOKEN_KEY, response.data.resetToken);
      }
      toast.success('Password reset instructions sent to your email');
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Unable to request password reset';
      toast.error(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (token: string, newPassword: string): Promise<void> => {
    setIsLoading(true);

    try {
      await api.post('/auth/reset-password', {
        token,
        newPassword,
      });

      localStorage.removeItem(RESET_TOKEN_KEY);
      toast.success('Password reset successfully');
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Unable to reset password';
      toast.error(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function
  const logout = (): void => {
    setUser(null);
    localStorage.removeItem(USER_STORAGE_KEY);
    setStoredToken(null);
    toast.success('Logged out successfully');
  };

  // Update user profile
  const updateProfile = async (userId: string, updates: ProfileUpdatePayload): Promise<void> => {
    setIsLoading(true);

    try {
      const response = await api.patch<AppUser>(`/users/${userId}/profile`, updates);
      const updatedUser = response.data;

      if (user?.id === userId) {
        setUser(updatedUser);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
      }
      
      toast.success('Profile updated successfully');
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Unable to update profile';
      toast.error(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    user,
    login,
    register,
    logout,
    forgotPassword,
    resetPassword,
    updateProfile,
    isAuthenticated: !!user,
    isLoading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook for using auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};