import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { API_BASE_URL } from '../api/client';

type User = {
  uid: string;
  name: string | null;
  email: string | null;
  role?: string | null;
  isAdminOrFaculty?: boolean;
};

type AppContextValue = {
  user: User | null;
  isAdminOrFaculty: boolean;
  purchasedCourses: string[];
  isReady: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  verifyOtpAndSignup: (phone: string, accessToken: string, name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  getEmailByPhone: (phone: string) => Promise<{ ok: boolean; email?: string; error?: string }>;
  sendPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>;
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

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        let role = 'student';
        try {
          const idTokenResult = await firebaseUser.getIdTokenResult();
          role =
            (idTokenResult.claims.role as string) ||
            (idTokenResult.claims.admin ? 'admin' : (idTokenResult.claims.faculty ? 'faculty' : 'student'));
        } catch {
          // ignore error
        }

        const emailLower = (firebaseUser.email || '').toLowerCase();

        // Check backend /api/auth/me to sync database role if available
        try {
          const token = await firebaseUser.getIdToken();
          const meRes = await fetch(`${API_BASE_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (meRes.ok) {
            const meData = await meRes.json();
            if (meData?.user?.role) {
              role = meData.user.role;
            }
          }
        } catch {
          // offline or backend unreachable fallback
        }

        const isStaff =
          role === 'admin' ||
          role === 'faculty' ||
          emailLower.includes('admin') ||
          emailLower.includes('faculty') ||
          emailLower === 'abhinavpvt1906@gmail.com';

        setUser({
          uid: firebaseUser.uid,
          name: firebaseUser.displayName,
          email: firebaseUser.email,
          role,
          isAdminOrFaculty: isStaff,
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

  const isAdminOrFaculty = Boolean(
    user?.isAdminOrFaculty || user?.role === 'admin' || user?.role === 'faculty'
  );

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      isAdminOrFaculty,
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
      verifyOtpAndSignup: async (phone, accessToken, name, email, password) => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/auth/verify-otp-and-signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, accessToken, name, email, password }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          
          // Once signed up in backend, login with Firebase directly
          await signInWithEmailAndPassword(auth, email.trim(), password);
          return { ok: true };
        } catch (error: any) {
          return { ok: false, error: error.message || 'Invalid Access Token or Signup failed' };
        }
      },
      getEmailByPhone: async (phone: string) => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/auth/get-email-by-phone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          return { ok: true, email: data.email };
        } catch (error: any) {
          return { ok: false, error: error.message || 'Account not found for this phone' };
        }
      },
      sendPasswordReset: async (email: string) => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/auth/send-password-reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          return { ok: true };
        } catch (error: any) {
          return { ok: false, error: error.message || 'Failed to send reset link' };
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