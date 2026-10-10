import { useState, useEffect } from 'react'
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, sendEmailVerification, type User } from 'firebase/auth'
import { auth } from '../firebase'
import { apiFetch, uploadFile, API_BASE_URL, type AdminCourse } from '../api'
import CourseManager from './CourseManager'
import CategoryManager from './CategoryManager'
import CourseContentManager from './CourseContentManager'
import RoleGuard from '../components/RoleGuard'
import Coupons from './Coupons'
import GoLive from './GoLive'
import Notifications from './Notifications'
import Tests from './Tests'
import ManageAdmins from './ManageAdmins'
import '../index.css'

type MeInfo = { isSuperAdmin: boolean; superAdminEmailUnverified: boolean }

function App() {
  // Whether to show Super Admin controls. Decided by the backend from the verified token;
  // every admin-management API checks it again on its own.
  const [me, setMe] = useState<MeInfo>({ isSuperAdmin: false, superAdminEmailUnverified: false });
  const [openCreateAdmin, setOpenCreateAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeStudents, setActiveStudents] = useState(0);
  const [contentStats, setContentStats] = useState<Record<string, number>>({});
  const [usersList, setUsersList] = useState<any[]>([]);

  const [coursesList, setCoursesList] = useState<AdminCourse[]>([]);
  
  // Toast State
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Upload Content State
  const [selectedCourseForContent, setSelectedCourseForContent] = useState('');

  // Banners State
  const [bannersList, setBannersList] = useState<any[]>([]);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  const fetchBanners = async () => {
    try {
      const data = await apiFetch('/banners');
      if (data.success) {
        setBannersList(data.data);
      }
    } catch (e) {
      console.error("Failed to fetch banners", e);
    }
  };

  // Admin access is decided by the `admin` custom claim set server-side
  // (Backend/tools/set-admin.mjs). The backend re-checks it on every request.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const fetchCourses = async () => {
    try {
      const data = await apiFetch<{ data: AdminCourse[] }>('/admin/courses');
      setCoursesList(data.data);
    } catch (e) {
      console.error("Failed to fetch courses", e);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await apiFetch('/stats');
      if (data.success) {
        setActiveStudents(data.activeStudents);
        setContentStats(data.content || {});
        setUsersList(data.users || []);
      }
    } catch (e) {
      console.error("Failed to fetch stats", e);
    }
  };
  const fetchMe = async () => {
    try {
      const data = await apiFetch<{ user?: Partial<MeInfo> }>('/auth/me');
      setMe({ isSuperAdmin: data.user?.isSuperAdmin === true, superAdminEmailUnverified: data.user?.superAdminEmailUnverified === true });
    } catch {
      setMe({ isSuperAdmin: false, superAdminEmailUnverified: false });
    }
  };

  useEffect(() => {
    if (user) fetchMe();
    else setMe({ isSuperAdmin: false, superAdminEmailUnverified: false });
  }, [user]);

  // Leave the admin page if the signed-in account is not the Super Admin
  useEffect(() => {
    if (activeTab === 'admins' && !me.isSuperAdmin) setActiveTab('dashboard');
  }, [activeTab, me.isSuperAdmin]);

  const handleSendVerification = async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      showToast(`Verification email sent to ${auth.currentUser.email}`, 'success');
    } catch (e: any) {
      showToast('Could not send the verification email: ' + (e?.message || e?.code), 'error');
    }
  };

  const handleVerifiedCheck = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    await fetchMe();
    if (!auth.currentUser.emailVerified) showToast('Email not verified yet — open the link in the verification email first', 'error');
  };

  useEffect(() => {
    if (user && (activeTab === 'courses' || activeTab === 'dashboard' || activeTab === 'content')) {
      fetchCourses();
      if (activeTab === 'dashboard') {
        fetchStats();
      }
    }
    if (user && activeTab === 'banners') {
      fetchBanners();
    }
  }, [activeTab, user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error: any) {
      const code: string = error?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        setLoginError('Wrong email or password, or this email has no Firebase account. Check Firebase Console → Authentication → Users.');
      } else if (code === 'auth/too-many-requests') {
        setLoginError('Too many attempts. Wait a few minutes or reset the password in Firebase Console.');
      } else if (code === 'auth/network-request-failed') {
        setLoginError('Network error — check your internet connection.');
      } else {
        setLoginError('Login failed: ' + (error?.message || code));
      }
    } finally {
      setIsLoggingIn(false);
    }
  };



  const handleUploadBanner = async () => {
    if (!bannerFile) {
      showToast("Please select an image file first", "error");
      return;
    }
    if (bannersList.length >= 5) {
      showToast("Maximum 5 banners allowed. Delete one first.", "error");
      return;
    }
    
    setIsUploadingBanner(true);
    try {
      // Banners store absolute URLs (the banners API predates server-relative paths).
            // Images now come back as full S3 URLs; older local uploads are server-relative paths
      const uploadedUrl = await uploadFile(bannerFile);
      const imageUrl = uploadedUrl.startsWith('/') ? API_BASE_URL + uploadedUrl : uploadedUrl;

      const data = await apiFetch('/banners', { method: 'POST', body: { imageUrl } });
      if (data.success) {
        showToast("Banner uploaded successfully", "success");
        setBannerFile(null);
        fetchBanners();
      } else {
        throw new Error(data.error);
      }
    } catch (e: any) {
      showToast("Banner Upload Error: " + e.message, "error");
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleDeleteBanner = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this banner?")) return;
    try {
      const data = await apiFetch(`/banners/${id}`, { method: 'DELETE' });
      if (data.success) {
        showToast("Banner deleted", "success");
        fetchBanners();
      } else {
        showToast(data.error, "error");
      }
    } catch (e: any) {
      showToast("Error: " + e.message, "error");
    }
  };

  const loginForm = (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
      <form onSubmit={handleLogin} className="glass-card" style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-md)' }}>
          <h2 style={{ color: 'white', marginBottom: '8px' }}>Admin & Faculty CMS Login</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Enter your Firebase credentials</p>
        </div>
        <input 
          type="email" 
          placeholder="Admin Email" 
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-field" 
          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }} 
          required 
        />
        <input 
          type="password" 
          placeholder="Password" 
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-field" 
          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }} 
          required 
        />
        {loginError && (
          <p role="alert" style={{ color: '#ff8a8a', fontSize: '0.85rem', lineHeight: 1.5, background: 'rgba(255,94,94,0.1)', border: '1px solid rgba(255,94,94,0.3)', borderRadius: '8px', padding: '10px 12px', wordBreak: 'break-word' }}>
            {loginError}
          </p>
        )}
        <button type="submit" disabled={isLoggingIn} className="btn" style={{ width: '100%', marginTop: 'var(--space-sm)' }}>{isLoggingIn ? 'Logging in...' : 'Login'}</button>
      </form>
    </div>
  );

  return (
    <RoleGuard allowedRoles={['admin', 'faculty']} fallbackLogin={loginForm}>
      <div className="layout">
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: toast.type === 'success' ? 'var(--mint)' : '#ff5e5e',
          color: toast.type === 'success' ? 'var(--navy)' : 'white',
          padding: '12px 24px',
          borderRadius: '8px',
          fontWeight: 'bold',
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          {toast.message}
        </div>
      )}

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          Edurain CMS
        </div>
        <nav className="sidebar-nav">
          <div className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            Dashboard
          </div>
          <div className={`nav-link ${activeTab === 'courses' ? 'active' : ''}`} onClick={() => setActiveTab('courses')}>
            Course Manager
          </div>
          <div className={`nav-link ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>
            Categories
          </div>
          <div className={`nav-link ${activeTab === 'content' ? 'active' : ''}`} onClick={() => setActiveTab('content')}>
            Upload Content (PDF/Video)
          </div>
          <div className={`nav-link ${activeTab === 'banners' ? 'active' : ''}`} onClick={() => setActiveTab('banners')}>
            Manage Banners
          </div>
          <div className={`nav-link ${activeTab === 'coupons' ? 'active' : ''}`} onClick={() => setActiveTab('coupons')}>
            Private/Public Coupons
          </div>
          <div className={`nav-link ${activeTab === 'golive' ? 'active' : ''}`} onClick={() => setActiveTab('golive')}>
            Go Live (Google Meet)
          </div>
          <div className={`nav-link ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>
            Notifications
          </div>
          <div className={`nav-link ${activeTab === 'tests' ? 'active' : ''}`} onClick={() => setActiveTab('tests')}>
            Tests
          </div>
          {me.isSuperAdmin && (
            <div className={`nav-link ${activeTab === 'admins' ? 'active' : ''}`} onClick={() => setActiveTab('admins')}>
              Manage Admins
            </div>
          )}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="page-header">
          <h1 className="page-title">
            {activeTab === 'dashboard' && 'Overview'}
            {activeTab === 'courses' && 'Course Manager'}
            {activeTab === 'categories' && 'Category Management'}
            {activeTab === 'content' && 'Post-Purchase Content'}
            {activeTab === 'banners' && 'Manage Homepage Banners'}
            {activeTab === 'coupons' && 'Coupon Generator'}
            {activeTab === 'golive' && 'Live Classes'}
            {activeTab === 'notifications' && 'Notifications'}
            {activeTab === 'tests' && 'Test Management'}
            {activeTab === 'admins' && 'Manage Admins'}
          </h1>
          <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          {me.isSuperAdmin && (
              <button
                onClick={() => { setActiveTab('admins'); setOpenCreateAdmin(true); }}
                className="btn"
                style={{ padding: '6px 12px' }}
              >
                + Create Admin
              </button>
            )}
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{user?.email}</span>
            <button onClick={() => signOut(auth)} className="btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px' }}>Logout</button>
          </div>
        </header>
        {me.superAdminEmailUnverified && (
          <div className="glass-card" role="status" style={{ marginBottom: 'var(--space-lg)', border: '1px solid rgba(214,158,46,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <p style={{ color: 'white', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Verify your email address to unlock admin management (Create Admin, Manage Admins).
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="btn" style={{ padding: '6px 12px' }} onClick={handleSendVerification}>Send Verification Email</button>
              <button className="btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px' }} onClick={handleVerifiedCheck}>I've Verified</button>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <>
            <div className="dashboard-grid">
              <div className="glass-card stat-card">
                <span className="stat-label">Total Courses</span>
                <span className="stat-value">{coursesList.length}</span>
              </div>
              <div className="glass-card stat-card">
                <span className="stat-label">Published</span>
                <span className="stat-value">{coursesList.filter(c => c.isPublished).length}</span>
              </div>
              <div className="glass-card stat-card">
                <span className="stat-label">Active Students</span>
                <span className="stat-value">{activeStudents}</span>
              </div>
              {Object.entries(contentStats).map(([k, v]) => (
                <div key={k} className="glass-card stat-card">
                  <span className="stat-label" style={{ textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</span>
                  <span className="stat-value">{v}</span>
                </div>
              ))}
            </div>
            <div className="glass-card" style={{ minHeight: '300px', overflowX: 'auto' }}>
              <h3 style={{ marginBottom: 'var(--space-md)' }}>Registered Students</h3>
              {usersList.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No students registered yet.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Name</th>
                      <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Email</th>
                      <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Phone</th>
                      <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Location</th>
                      <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.map((u, i) => (
                      <tr key={u.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '12px 8px' }}>{u.name || '-'}</td>
                        <td style={{ padding: '12px 8px' }}>{u.email}</td>
                        <td style={{ padding: '12px 8px' }}>{u.phone || '-'}</td>
                        <td style={{ padding: '12px 8px' }}>
                          {[u.city, u.state].filter(Boolean).join(', ') || '-'}
                        </td>
                        <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {activeTab === 'courses' && (
          <CourseManager
            courses={coursesList}
            reloadCourses={fetchCourses}
            showToast={showToast}
            onManageContent={(courseId) => {
              setSelectedCourseForContent(String(courseId));
              setActiveTab('content');
            }}
          />
        )}

        {activeTab === 'categories' && (
          <CategoryManager showToast={showToast} onCategoriesChanged={fetchCourses} />
        )}

        {activeTab === 'content' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <CourseContentManager
              courses={coursesList}
              selectedCourseId={selectedCourseForContent}
              onSelectCourse={setSelectedCourseForContent}
              showToast={showToast}
            />
          </div>
        )}

        {activeTab === 'banners' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <div className="glass-card">
              <h3 style={{ marginBottom: 'var(--space-md)' }}>Uploaded Banners ({bannersList.length}/5)</h3>
              {bannersList.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No banners uploaded yet.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {bannersList.map(banner => (
                    <div key={banner.id} style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <img src={banner.imageUrl} alt="Banner" style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }} />
                      <button 
                        onClick={() => handleDeleteBanner(banner.id)}
                        style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(255,0,0,0.8)', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass-card">
              <h3 style={{ marginBottom: 'var(--space-md)' }}>Upload New Banner</h3>
              <form style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                <div style={{ border: '2px dashed rgba(255,255,255,0.2)', padding: 'var(--space-xl)', textAlign: 'center', borderRadius: 'var(--radius-md)' }}>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>Select Banner Image</p>
                  <input type="file" accept="image/*" onChange={e => setBannerFile(e.target.files?.[0] || null)} className="input-field" style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', cursor: 'pointer' }} />
                </div>
                
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Note: These banners are used for notices and will appear as a sliding carousel on the top of the mobile app home screen.
                </p>

                <button type="button" onClick={handleUploadBanner} disabled={isUploadingBanner || !bannerFile} className="btn" style={{ alignSelf: 'flex-start' }}>
                  {isUploadingBanner ? 'Uploading...' : 'Upload & Set Live'}
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'coupons' && (
          <Coupons user={user!} coursesList={coursesList} showToast={showToast} />
        )}

        {activeTab === 'golive' && (
          <GoLive user={user!} coursesList={coursesList} showToast={showToast} />
        )}

        {activeTab === 'notifications' && (
          <Notifications showToast={showToast} />
        )}

        {activeTab === 'tests' && (
          <Tests showToast={showToast} />
        )}
        {activeTab === 'admins' && me.isSuperAdmin && (
          <ManageAdmins
            showToast={showToast}
            openCreate={openCreateAdmin}
            onCreateOpened={() => setOpenCreateAdmin(false)}
          />
        )}        
      </main>
    </div>
  </RoleGuard>
  )
}

export default App