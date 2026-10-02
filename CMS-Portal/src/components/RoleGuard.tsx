import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from '../firebase';
import { apiFetch } from '../api';

export type AllowedRole = 'admin' | 'faculty';

export interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles?: AllowedRole[];
  fallbackLogin?: React.ReactNode;
}

export function RoleGuard({
  children,
  allowedRoles = ['admin', 'faculty'],
  fallbackLogin,
}: RoleGuardProps) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const checkUserRole = async (currentUser: User) => {
    try {
      // 1. Check Firebase ID Token custom claims
      const tokenResult = await currentUser.getIdTokenResult(true);
      let detectedRole = 'student';

      if (tokenResult.claims.admin === true || tokenResult.claims.role === 'admin') {
        detectedRole = 'admin';
      } else if (tokenResult.claims.faculty === true || tokenResult.claims.role === 'faculty') {
        detectedRole = 'faculty';
      } else if (typeof tokenResult.claims.role === 'string') {
        detectedRole = tokenResult.claims.role.toLowerCase();
      } else {
        // 2. Fallback check with Backend /api/auth/me
        try {
          const res = await apiFetch<{ success: boolean; user?: { role?: string } }>('/auth/me');
          if (res?.user?.role) {
            detectedRole = res.user.role.toLowerCase();
          }
        } catch {
          // If backend check fails or user record isn't synced yet, retain student
          detectedRole = 'student';
        }
      }

      setRole(detectedRole);
      setError(null);
    } catch (err: any) {
      console.error('[RoleGuard] Error verifying user permissions:', err);
      setError(err.message || 'Failed to verify user permissions');
      setRole('student');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await checkUserRole(currentUser);
      } else {
        setRole(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setRole(null);
    } catch (err: any) {
      console.error('[RoleGuard] Sign out error:', err);
    }
  };

  const handleRefreshPermissions = async () => {
    if (!user) return;
    setIsRefreshing(true);
    await checkUserRole(user);
  };

  // 1. Loading State
  if (loading) {
    return (
      <div style={styles.centerContainer}>
        <div className="glass-card" style={styles.loadingCard}>
          <div style={styles.spinner} />
          <h3 style={{ marginTop: '1.2rem', color: '#ffffff' }}>Verifying Access</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.4rem' }}>
            Checking role-based credentials and security privileges...
          </p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated State (not logged in)
  if (!user) {
    if (fallbackLogin) {
      return <>{fallbackLogin}</>;
    }
    return (
      <div style={styles.centerContainer}>
        <div className="glass-card" style={styles.card}>
          <h2 style={{ color: '#ffffff', marginBottom: '8px' }}>Admin & Faculty Sign In</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Please authenticate with your authorized credentials to access the CMS Dashboard.
          </p>
        </div>
      </div>
    );
  }

  // 3. Unauthorized State (e.g. Student or non-admin account)
  const isAuthorized = role !== null && allowedRoles.includes(role as AllowedRole);
  if (!isAuthorized) {
    return (
      <div style={styles.centerContainer}>
        <div className="glass-card" style={styles.unauthorizedCard}>
          {/* Warning Icon Badge */}
          <div style={styles.iconCircle}>
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ff5e5e"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h2 style={styles.unauthorizedTitle}>Unauthorized Access</h2>
          
          <div style={styles.roleBadge}>
            Role: <strong>{(role || 'STUDENT').toUpperCase()}</strong>
          </div>

          <p style={styles.unauthorizedDesc}>
            Your account (<strong>{user.email}</strong>) does not have sufficient permissions to access the Edurain CMS Portal.
          </p>

          <div style={styles.infoBox}>
            <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5' }}>
              Access is restricted strictly to accounts with <strong>Admin</strong> or <strong>Faculty</strong> roles.
              Students and unauthorized users are blocked from viewing or managing course materials.
            </p>
          </div>

          {error && (
            <p style={{ color: '#f87171', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              {error}
            </p>
          )}

          <div style={styles.buttonGroup}>
            <button
              onClick={handleRefreshPermissions}
              disabled={isRefreshing}
              style={styles.refreshBtn}
            >
              {isRefreshing ? 'Checking...' : 'Refresh Permissions'}
            </button>

            <button
              onClick={handleSignOut}
              style={styles.signOutBtn}
            >
              Sign Out & Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Authorized State -> Render Protected Children
  return <>{children}</>;
}

const styles: Record<string, React.CSSProperties> = {
  centerContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '1.5rem',
    backgroundColor: 'var(--bg-color)',
  },
  card: {
    width: '100%',
    maxWidth: '460px',
    textAlign: 'center',
  },
  loadingCard: {
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center',
    padding: '3rem 2rem',
  },
  unauthorizedCard: {
    width: '100%',
    maxWidth: '480px',
    textAlign: 'center',
    padding: '2.5rem 2rem',
    border: '1px solid rgba(255, 94, 94, 0.25)',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 94, 94, 0.1)',
  },
  iconCircle: {
    width: '84px',
    height: '84px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 94, 94, 0.12)',
    border: '1px solid rgba(255, 94, 94, 0.3)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    margin: '0 auto 1.5rem auto',
  },
  unauthorizedTitle: {
    color: '#ffffff',
    fontSize: '1.65rem',
    fontWeight: 700,
    marginBottom: '0.6rem',
    letterSpacing: '-0.5px',
  },
  roleBadge: {
    display: 'inline-block',
    padding: '0.3rem 0.8rem',
    borderRadius: '20px',
    backgroundColor: 'rgba(255, 94, 94, 0.15)',
    color: '#ff7a7a',
    fontSize: '0.78rem',
    fontWeight: 600,
    letterSpacing: '0.5px',
    marginBottom: '1rem',
  },
  unauthorizedDesc: {
    color: 'var(--text-secondary)',
    fontSize: '0.95rem',
    lineHeight: 1.5,
    marginBottom: '1.2rem',
  },
  infoBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    padding: '0.9rem 1.1rem',
    textAlign: 'left',
    marginBottom: '1.8rem',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  signOutBtn: {
    padding: '0.75rem 1.2rem',
    backgroundColor: '#ff5e5e',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.92rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  refreshBtn: {
    padding: '0.75rem 1.2rem',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    color: '#ffffff',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '8px',
    fontSize: '0.92rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  spinner: {
    width: '44px',
    height: '44px',
    margin: '0 auto',
    border: '4px solid rgba(255, 255, 255, 0.1)',
    borderTopColor: '#ff5e5e',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

export default RoleGuard;
