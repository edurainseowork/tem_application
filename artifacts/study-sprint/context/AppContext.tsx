import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { auth } from '../firebaseConfig';

type User = {
  uid: string;
  name: string | null;
  email: string | null;
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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [purchasedCourses, setPurchasedCourses] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Load local purchases state
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!value) return;
        const saved = JSON.parse(value) as { purchasedCourses?: string[] };
        setPurchasedCourses(saved.purchasedCourses ?? []);
      })
      .catch(() => undefined);

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          name: firebaseUser.displayName,
          email: firebaseUser.email,
        });
      } else {
        setUser(null);
      }
      setIsReady(true);
    });

    return () => unsubscribe();
  }, []);

  const persistPurchases = async (nextPurchasedCourses: string[]) => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        purchasedCourses: nextPurchasedCourses,
      }),
    );
  };

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      purchasedCourses,
      isReady,
      login: async (email, password) => {
        try {
          await signInWithEmailAndPassword(auth, email.trim(), password);
          return { ok: true };
        } catch (error: any) {
          return { ok: false, error: error.message || 'Login failed' };
        }
      },
      signup: async (name, email, password) => {
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
          if (userCredential.user) {
            await updateProfile(userCredential.user, { displayName: name.trim() });
            setUser({
              uid: userCredential.user.uid,
              name: name.trim(),
              email: userCredential.user.email,
            });
          }
          return { ok: true };
        } catch (error: any) {
          return { ok: false, error: error.message || 'Signup failed' };
        }
      },
      logout: async () => {
        await signOut(auth);
      },
      purchaseCourse: async (courseId) => {
        // TODO: In the future, this should sync with AWS Backend (/razorpay webhook)
        const nextPurchasedCourses = purchasedCourses.includes(courseId)
          ? purchasedCourses
          : [...purchasedCourses, courseId];
        setPurchasedCourses(nextPurchasedCourses);
        await persistPurchases(nextPurchasedCourses);
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