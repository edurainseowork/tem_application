import { useState, useEffect } from 'react'
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { auth } from '../firebase'
import { apiFetch, uploadFile, API_BASE_URL, type AdminCourse } from '../api'
import CourseManager from './CourseManager'
import CategoryManager from './CategoryManager'
import '../index.css'

function App() {
  const [activeTab, setActiveTab] = useState('courses');
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeStudents, setActiveStudents] = useState(0);

  const [coursesList, setCoursesList] = useState<AdminCourse[]>([]);
  
  // Toast State
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Upload Content State
  const [selectedCourseForContent, setSelectedCourseForContent] = useState('');
  const [courseContentList, setCourseContentList] = useState<any[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);

  const [contentType, setContentType] = useState('Folder');
  const [contentTitle, setContentTitle] = useState('');
  const [contentFile, setContentFile] = useState<File | null>(null);
  const [contentUrl, setContentUrl] = useState('');
  const [isUploadingContent, setIsUploadingContent] = useState(false);

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

  const fetchCourseContent = async (courseId: string) => {
    try {
      const data = await apiFetch(`/content/${courseId}`);
      if (data.success) {
        setCourseContentList(data.data);
      }
    } catch (e) {
      console.error("Failed to fetch content", e);
    }
  };

  useEffect(() => {
    if (selectedCourseForContent) {
      fetchCourseContent(selectedCourseForContent);
      setCurrentFolderId(null);
    } else {
      setCourseContentList([]);
      setCurrentFolderId(null);
    }
  }, [selectedCourseForContent]);

  // Admin access is decided by the `admin` custom claim set server-side
  // (Backend/tools/set-admin.mjs). The backend re-checks it on every request.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const token = await currentUser.getIdTokenResult(true).catch(() => null);
        if (!token) {
          await signOut(auth);
          setUser(null);
          setLoginError('Could not verify your session with Firebase. Check your internet connection and try again.');
          setLoading(false);
          return;
        }
        if (token.claims.admin !== true) {
          await signOut(auth);
          setUser(null);
          setLoginError(
            `Password is correct, but ${currentUser.email} is not a CMS admin yet. ` +
            `Run in Backend/:  node tools/set-admin.mjs grant ${currentUser.email}  — then log in again.`
          );
          setLoading(false);
          return;
        }
        setLoginError('');
      }
      setUser(currentUser);
      setLoading(false);
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
      }
    } catch (e) {
      console.error("Failed to fetch stats", e);
    }
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

  const handleUploadContent = async () => {
    if (!selectedCourseForContent) {
      showToast("Please select a target course first", "error");
      return;
    }
    if (!contentTitle) {
      showToast("Please enter a title for the content", "error");
      return;
    }
    if (contentType === 'PDF' && !contentFile) {
      showToast("Please select a PDF file", "error");
      return;
    }
    if (contentType === 'Video' && !contentUrl) {
      showToast("Please enter a Vimeo URL", "error");
      return;
    }

    setIsUploadingContent(true);
    try {
      let finalContentUrl = contentUrl;
      
      if (contentType === 'PDF' && contentFile) {
        finalContentUrl = await uploadFile(contentFile);
      }

      const data = await apiFetch(`/content/${selectedCourseForContent}`, {
        method: 'POST',
        body: {
          parentId: currentFolderId,
          type: contentType.toLowerCase(), // 'folder', 'pdf', 'video'
          title: contentTitle,
          url: contentType === 'Folder' ? null : finalContentUrl
        }
      });
      
      if (data.success) {
        showToast(`${contentType} "${contentTitle}" added successfully!`, "success");
        setContentTitle('');
        setContentFile(null);
        setContentUrl('');
        fetchCourseContent(selectedCourseForContent);
      } else {
        throw new Error(data.error);
      }
    } catch (e: any) {
      showToast("Upload Error: " + e.message, "error");
    } finally {
      setIsUploadingContent(false);
    }
  };

  const handleDeleteContent = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    try {
      const data = await apiFetch(`/content/${id}`, { method: 'DELETE' });
      if (data.success) {
        showToast("Item deleted", "success");
        fetchCourseContent(selectedCourseForContent);
      } else {
        showToast(data.error, "error");
      }
    } catch (e: any) {
      showToast("Error: " + e.message, "error");
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
      const imageUrl = API_BASE_URL + await uploadFile(bannerFile);

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

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'white' }}>Loading...</div>;
  }

  if (!user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
        <form onSubmit={handleLogin} className="glass-card" style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-md)' }}>
            <h2 style={{ color: 'white', marginBottom: '8px' }}>Admin CMS Login</h2>
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
  }

  return (
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
            Upload Content (PDF/Video/Test)
          </div>
          <div className={`nav-link ${activeTab === 'banners' ? 'active' : ''}`} onClick={() => setActiveTab('banners')}>
            Manage Banners
          </div>
          <div className={`nav-link ${activeTab === 'coupons' ? 'active' : ''}`} onClick={() => setActiveTab('coupons')}>
            Private/Public Coupons
          </div>
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
          </h1>
          <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{user.email}</span>
            <button onClick={() => signOut(auth)} className="btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px' }}>Logout</button>
          </div>
        </header>

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
            </div>
            <div className="glass-card" style={{ minHeight: '300px' }}>
              <h3 style={{ marginBottom: 'var(--space-md)' }}>Recent Activity</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Welcome to the CMS Dashboard.</p>
            </div>
          </>
        )}

        {activeTab === 'courses' && (
          <CourseManager courses={coursesList} reloadCourses={fetchCourses} showToast={showToast} />
        )}

        {activeTab === 'categories' && (
          <CategoryManager showToast={showToast} onCategoriesChanged={fetchCourses} />
        )}

        {activeTab === 'content' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <div className="glass-card">
              <h3 style={{ marginBottom: 'var(--space-md)' }}>Manage Post-Purchase Content</h3>
              <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                <select value={selectedCourseForContent} onChange={e => setSelectedCourseForContent(e.target.value)} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option value="">Select Target Course</option>
                  {coursesList.map(course => (
                    <option key={course.id} value={course.id}>{course.title}{course.isPublished ? '' : ' (draft)'}</option>
                  ))}
                </select>
              </div>
              
              {selectedCourseForContent && (
                <>
                  <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '16px', marginBottom: 'var(--space-lg)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      <span style={{ cursor: 'pointer', color: currentFolderId === null ? 'white' : 'var(--accent-primary)' }} onClick={() => setCurrentFolderId(null)}>Root</span>
                      {currentFolderId && (
                        <>
                          <span>/</span>
                          <span style={{ color: 'white' }}>{courseContentList.find(c => c.id === currentFolderId)?.title || 'Folder'}</span>
                        </>
                      )}
                    </div>
                    
                    {courseContentList.filter(c => c.parentId === currentFolderId).length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', margin: '20px 0' }}>This folder is empty.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {courseContentList.filter(c => c.parentId === currentFolderId).map(item => (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: item.type === 'folder' ? 'pointer' : 'default' }} onClick={() => item.type === 'folder' && setCurrentFolderId(item.id)}>
                              {item.type === 'folder' && <span style={{ fontSize: '1.2rem' }}>📁</span>}
                              {item.type === 'pdf' && <span style={{ fontSize: '1.2rem' }}>📄</span>}
                              {item.type === 'video' && <span style={{ fontSize: '1.2rem' }}>🎥</span>}
                              <span style={{ color: item.type === 'folder' ? 'var(--accent-primary)' : 'white', fontWeight: item.type === 'folder' ? 'bold' : 'normal' }}>{item.title}</span>
                            </div>
                            <button onClick={() => handleDeleteContent(item.id)} style={{ background: 'transparent', border: 'none', color: '#ff5e5e', cursor: 'pointer' }}>Delete</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 'var(--space-md)' }}>
                    <h4 style={{ marginBottom: 'var(--space-md)' }}>Add Item Here</h4>
                    <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                      <select value={contentType} onChange={e => setContentType(e.target.value)} style={{ padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <option value="Folder">Folder</option>
                        <option value="PDF">Class Notes (PDF)</option>
                        <option value="Video">Recorded Lecture (Vimeo Link)</option>
                      </select>
                      <input type="text" value={contentTitle} onChange={e => setContentTitle(e.target.value)} placeholder="Item Title..." style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }} />
                    </div>

                    {contentType === 'PDF' && (
                      <div style={{ border: '2px dashed rgba(255,255,255,0.2)', padding: 'var(--space-xl)', textAlign: 'center', borderRadius: 'var(--radius-md)' }}>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>Select PDF File</p>
                        <input type="file" accept="application/pdf" onChange={e => setContentFile(e.target.files?.[0] || null)} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', cursor: 'pointer' }} />
                      </div>
                    )}

                    {contentType === 'Video' && (
                      <div style={{ marginTop: 'var(--space-md)' }}>
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Vimeo URL</label>
                        <input type="text" value={contentUrl} onChange={e => setContentUrl(e.target.value)} placeholder="https://vimeo.com/..." style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }} />
                      </div>
                    )}

                    <button type="button" onClick={handleUploadContent} disabled={isUploadingContent} className="btn" style={{ marginTop: 'var(--space-md)' }}>
                      {isUploadingContent ? 'Saving...' : `Create ${contentType}`}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="glass-card">
              <h3 style={{ marginBottom: 'var(--space-md)' }}>Create Weekly Test / Quiz</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)', fontSize: '0.9rem' }}>
                Note: In the app, this test will open in strict Full-Screen mode. If the user presses back, the test will end automatically and score will be submitted to AWS.
              </p>
              <form style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                <input type="text" placeholder="Test Title (e.g. Thermodynamics Week 1)" style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }} />
                <textarea rows={3} placeholder="Question 1 (Text format)" style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }} />
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  <input type="text" placeholder="Option A" style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }} />
                  <input type="text" placeholder="Option B" style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }} />
                </div>
                <button type="button" className="btn" style={{ alignSelf: 'flex-start', marginTop: 'var(--space-sm)', background: 'transparent', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)' }}>+ Add Next Question</button>
                <button type="button" className="btn" style={{ alignSelf: 'flex-start', marginTop: 'var(--space-md)' }}>Publish Test</button>
              </form>
            </div>
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
          <div className="glass-card">
            <h3 style={{ marginBottom: 'var(--space-md)' }}>Generate Coupons</h3>
            <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Coupon Code</label>
                <input type="text" placeholder="e.g. DIWALI50" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Discount Amount / %</label>
                <input type="text" placeholder="e.g. 500" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }} />
              </div>
            </div>
            
            <div style={{ marginTop: 'var(--space-md)' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Coupon Type</label>
              <select style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}>
                <option>Public (Visible to everyone)</option>
                <option>Private (Hidden, applies only via link/code)</option>
              </select>
            </div>

            <button type="button" className="btn" style={{ marginTop: 'var(--space-lg)' }}>Generate Coupon</button>
          </div>
        )}
      </main>
    </div>
  )
}

export default App