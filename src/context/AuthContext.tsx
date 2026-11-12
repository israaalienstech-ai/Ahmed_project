/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { translateErrorMessage } from '../utils/errors';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  companyName: string;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshProfileAndSettings: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  companyName: 'برنامج التنبيه',
  login: async () => ({ success: false }),
  logout: async () => {},
  refreshProfileAndSettings: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [companyName, setCompanyName] = useState('برنامج التنبيه');

  const fetchUserData = useCallback(async (currentUser: User) => {
    try {
      // 1. Fetch user profile to verify role === 'admin'
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (!profileErr && profile) {
        setIsAdmin(profile.role === 'admin');
      } else {
        setIsAdmin(false);
      }

      // 2. Fetch company name from settings table (only post-auth per RLS)
      // Strictly select company_name only (no company_logo column per schema instruction)
      const { data: settingsData, error: settingsErr } = await supabase
        .from('settings')
        .select('company_name')
        .limit(1)
        .maybeSingle();

      if (!settingsErr && settingsData && settingsData.company_name) {
        setCompanyName(settingsData.company_name);
      }
    } catch (err) {
      console.warn('Failed to fetch profile or settings:', err);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // Initial session check
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) {
        fetchUserData(initialSession.user).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen to auth state transitions
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        await fetchUserData(newSession.user);
      } else {
        setIsAdmin(false);
        setCompanyName('برنامج التنبيه');
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUserData]);

  const login = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });

      if (error) {
        return { success: false, error: translateErrorMessage(error) };
      }

      if (data.user) {
        setUser(data.user);
        setSession(data.session);
        await fetchUserData(data.user);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: translateErrorMessage(err) };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
      setSession(null);
      setIsAdmin(false);
      setCompanyName('برنامج التنبيه');
    }
  };

  const refreshProfileAndSettings = async () => {
    if (user) {
      await fetchUserData(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAdmin,
        companyName,
        login,
        logout,
        refreshProfileAndSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
