import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type User = {
  name: string;
  email: string;
};

type AppContextValue = {
  user: User | null;
  purchasedCourses: string[];
  isReady: boolean;
  login: (name: string, email: string) => Promise<void>;
  logout: () => Promise<void>;
  purchaseCourse: (courseId: string) => Promise<void>;
  isPurchased: (courseId: string) => boolean;
};

const STORAGE_KEY = 'studysprint-state';
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [purchasedCourses, setPurchasedCourses] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!value) return;
        const saved = JSON.parse(value) as { user?: User | null; purchasedCourses?: string[] };
        setUser(saved.user ?? null);
        setPurchasedCourses(saved.purchasedCourses ?? []);
      })
      .catch(() => undefined)
      .finally(() => setIsReady(true));
  }, []);

  const persist = async (nextUser: User | null, nextPurchasedCourses: string[]) => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ user: nextUser, purchasedCourses: nextPurchasedCourses }),
    );
  };

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      purchasedCourses,
      isReady,
      login: async (name, email) => {
        const nextUser = { name: name.trim() || email.split('@')[0] || 'Student', email: email.trim() };
        setUser(nextUser);
        await persist(nextUser, purchasedCourses);
      },
      logout: async () => {
        setUser(null);
        await persist(null, purchasedCourses);
      },
      purchaseCourse: async (courseId) => {
        const nextPurchasedCourses = purchasedCourses.includes(courseId)
          ? purchasedCourses
          : [...purchasedCourses, courseId];
        setPurchasedCourses(nextPurchasedCourses);
        await persist(user, nextPurchasedCourses);
      },
      isPurchased: (courseId) => purchasedCourses.includes(courseId),
    }),
    [isReady, purchasedCourses, user],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}