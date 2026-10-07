import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
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
import { fetchProfile, recordStreakActivity } from '../api/profile';
import { fetchPurchasedCourseIds } from '../api/payments';

type User = {
  uid: string;
  name: string | null;
  email: string | null;
  role?: string | null;
  isAdminOrFaculty?: boolean;
    /** Profile picture URL (S3), shown on the home screen avatar */
  photo?: string | null;
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
  /** Updates the signed-in user's details in memory (e.g. after editing the profile). */
  updateUser: (patch: Partial<Pick<User, 'name' | 'email' | 'photo'>>) => void;
};

// The day streak is recorded at most this often while the app stays in the foreground
const STREAK_PING_INTERVAL_MS = 10 * 60 * 1000;


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
  
  // Stable identity, and a no-op when nothing changed, so screens can call it after every refresh
  const updateUser = useCallback((patch: Partial<Pick<User, 'name' | 'email' | 'photo'>>) => {
    setUser((current) => {
      if (!current) return current;
      const changed = (Object.keys(patch) as (keyof typeof patch)[]).some((key) => patch[key] !== current[key]);
      return changed ? { ...current, ...patch } : current;
    });
  }, []);
    // Load the profile picture once per login so the home screen avatar shows it without opening Profile
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    fetchProfile()
      .then((profile) => {
        if (!cancelled) updateUser({ photo: profile.profilePhoto });
      })
      .catch(() => undefined); // offline: the avatar falls back to the initial
    return () => {
      cancelled = true;
    };
  }, [user?.uid, updateUser]);

  // Day streak: tell the backend the student is active when they log in / open the app and
  // whenever the app returns to the foreground (the backend counts each day only once).
  const lastStreakPing = useRef(0);
  useEffect(() => {
    if (!user?.uid) return;
    const ping = () => {
      if (Date.now() - lastStreakPing.current < STREAK_PING_INTERVAL_MS) return;
      lastStreakPing.current = Date.now();
      recordStreakActivity().catch(() => {
        lastStreakPing.current = 0; // retry on the next foreground
      });
    };
    lastStreakPing.current = 0;
    ping();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') ping();
    });
    return () => subscription.remove();
  }, [user?.uid]);

  // Courses bought through Razorpay are stored on the server; merge them in after login
  // so purchases show up on every device
  useEffect(() => {
    if (!user?.uid) return;
    fetchPurchasedCourseIds()
      .then((ids) => {
        if (ids.length === 0) return;
        setPurchasedCourses((current) => {
          const merged = Array.from(new Set([...current, ...ids.map(String)]));
          if (merged.length !== current.length) persistPurchases(merged).catch(() => undefined);
          return merged;
        });
      })
      .catch(() => undefined);
  }, [user?.uid]);

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
            updateUser,
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