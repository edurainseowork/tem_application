import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type User = {
  name: string;
  email: string;
};

type LocalAccount = User & {
  passwordHash: string;
};

type AppContextValue = {
  user: User | null;
  purchasedCourses: string[];
  isReady: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  purchaseCourse: (courseId: string) => Promise<void>;
  isPurchased: (courseId: string) => boolean;
};

const STORAGE_KEY = 'studysprint-state';
const AppContext = createContext<AppContextValue | null>(null);

function hashPassword(password: string) {
  let hash = 5381;
  for (let index = 0; index < password.length; index += 1) {
    hash = (hash * 33) ^ password.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [purchasedCourses, setPurchasedCourses] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!value) return;
        const saved = JSON.parse(value) as {
          user?: User | null;
          purchasedCourses?: string[];
          accounts?: LocalAccount[];
        };
        setUser(saved.user ?? null);
        setPurchasedCourses(saved.purchasedCourses ?? []);
        setAccounts(saved.accounts ?? []);
      })
      .catch(() => undefined)
      .finally(() => setIsReady(true));
  }, []);

  const persist = async (
    nextUser: User | null,
    nextPurchasedCourses: string[],
    nextAccounts: LocalAccount[],
  ) => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        user: nextUser,
        purchasedCourses: nextPurchasedCourses,
        accounts: nextAccounts,
      }),
    );
  };

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      purchasedCourses,
      isReady,
      login: async (email, password) => {
        const normalizedEmail = email.trim().toLowerCase();
        const account = accounts.find((item) => item.email === normalizedEmail);
        if (!account || account.passwordHash !== hashPassword(password)) {
          return { ok: false, error: 'Email or password is incorrect.' };
        }
        const nextUser = { name: account.name, email: account.email };
        setUser(nextUser);
        await persist(nextUser, purchasedCourses, accounts);
        return { ok: true };
      },
      signup: async (name, email, password) => {
        const normalizedEmail = email.trim().toLowerCase();
        if (accounts.some((item) => item.email === normalizedEmail)) {
          return { ok: false, error: 'An account with this email already exists.' };
        }
        const nextUser = {
          name: name.trim() || normalizedEmail.split('@')[0] || 'Student',
          email: normalizedEmail,
        };
        const nextAccounts = [...accounts, { ...nextUser, passwordHash: hashPassword(password) }];
        setAccounts(nextAccounts);
        setUser(nextUser);
        await persist(nextUser, purchasedCourses, nextAccounts);
        return { ok: true };
      },
      logout: async () => {
        setUser(null);
        await persist(null, purchasedCourses, accounts);
      },
      purchaseCourse: async (courseId) => {
        const nextPurchasedCourses = purchasedCourses.includes(courseId)
          ? purchasedCourses
          : [...purchasedCourses, courseId];
        setPurchasedCourses(nextPurchasedCourses);
        await persist(user, nextPurchasedCourses, accounts);
      },
      isPurchased: (courseId) => purchasedCourses.includes(courseId),
    }),
    [accounts, isReady, purchasedCourses, user],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}