import { useState, useEffect } from 'react'
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { auth } from '../firebase'
import '../index.css'

function App() {
  const [activeTab, setActiveTab] = useState('courses');
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeStudents, setActiveStudents] = useState(0);

  // Course Form State
  const [courseTitle, setCourseTitle] = useState('');
  const [courseDesc, setCourseDesc] = useState('');
  const [coursePrice, setCoursePrice] = useState('');
  const [courseCategory, setCourseCategory] = useState('JEE');
  const [customCategory, setCustomCategory] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [coursesList, setCoursesList] = useState<any[]>([]);
  
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
      const res = await fetch('http://localhost:5000/api/banners');
      const data = await res.json();
      if (data.success) {
        setBannersList(data.data);
      }
    } catch (e) {
      console.error("Failed to fetch banners", e);
    }
  };

  const fetchCourseContent = async (courseId: string) => {
    try {
      const res = await fetch(`http://localhost:5000/api/content/${courseId}?admin=true`);
      const data = await res.json();
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

  const ALLOWED_ADMIN_EMAILS = [
    'abhinavpvt1906@gmail.com',
    'edurainseowork@gmail.com'
  ];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && currentUser.email && !ALLOWED_ADMIN_EMAILS.includes(currentUser.email.toLowerCase())) {
        signOut(auth);
        setUser(null);
        alert('You are not an admin');
      } else {
        setUser(currentUser);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const fetchCourses = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/courses');
      const data = await res.json();
      setCoursesList(data);
    } catch (e) {
      console.error("Failed to fetch courses", e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/stats');
      const data = await res.json();
      if (data.success) {
        setActiveStudents(data.activeStudents);
      }
    } catch (e) {
      console.error("Failed to fetch stats", e);
    }
  };

  useEffect(() => {
    if (user && (activeTab === 'courses' || activeTab === 'dashboard')) {
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
    if (!ALLOWED_ADMIN_EMAILS.includes(email.toLowerCase())) {
      showToast('You are not an admin', 'error');
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      showToast('Logged in successfully', 'success');
    } catch (error: any) {
      showToast('Login failed: ' + error.message, 'error');
    }
  };

  const handlePublishCourse = async () => {
    const finalCategory = courseCategory === 'custom' ? customCategory : courseCategory;

    if (!courseTitle || !courseDesc || !coursePrice || !thumbnailFile || !finalCategory) {
      showToast("Please fill all fields and select a thumbnail.", "error");
      return;
    }
    setIsPublishing(true);
    try {
      // 1. Upload Thumbnail
      const formData = new FormData();
      formData.append('image', thumbnailFile);
      
      const uploadRes = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        body: formData
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) throw new Error("Image upload failed");
      
      const thumbnailUrl = 'http://localhost:5000' + uploadData.url;

      // 2. Create Course
      const courseRes = await fetch('http://localhost:5000/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: courseTitle,
          description: courseDesc,
          price: Number(coursePrice) * 100, // API expects paise/cents
          thumbnail: thumbnailUrl,
          category: finalCategory
        })
      });
      const courseData = await courseRes.json();
      if (courseData.success) {
        showToast("Course Published Successfully!", "success");
        setCourseTitle('');
        setCourseDesc('');
        setCoursePrice('');
        setCourseCategory('JEE');
        setCustomCategory('');
        setThumbnailFile(null);
        fetchCourses(); // Refresh list
      } else {
        throw new Error(courseData.error || "Failed to create course");
      }
    } catch (err: any) {
      showToast("Error: " + err.message, "error");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteCourse = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this course?")) return;
    try {
      const res = await fetch(`http://localhost:5000/api/courses/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showToast("Course deleted successfully", "success");
        setCoursesList(coursesList.filter(c => c.id !== id));
      } else {
        showToast(data.error, "error");
      }
    } catch (e: any) {
      showToast("Error deleting course: " + e.message, "error");
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
        const formData = new FormData();
        formData.append('image', contentFile); // Backend upload expects 'image'
        
        const uploadRes = await fetch('http://localhost:5000/api/upload', {
          method: 'POST',
          body: formData
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.success) throw new Error("File upload failed. Ensure it is under 500KB.");
        finalContentUrl = 'http://localhost:5000' + uploadData.url;
      }

      const res = await fetch(`http://localhost:5000/api/content/${selectedCourseForContent}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: currentFolderId,
          type: contentType.toLowerCase(), // 'folder', 'pdf', 'video'
          title: contentTitle,
          url: finalContentUrl
        })
      });
      const data = await res.json();
      
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
      const res = await fetch(`http://localhost:5000/api/content/${id}`, { method: 'DELETE' });
      const data = await res.json();
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
      const formData = new FormData();
      formData.append('image', bannerFile);
      
      const uploadRes = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        body: formData
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) throw new Error("Image upload failed");
      
      const imageUrl = 'http://localhost:5000' + uploadData.url;

      const res = await fetch('http://localhost:5000/api/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl })
      });
      const data = await res.json();
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
      const res = await fetch(`http://localhost:5000/api/banners/${id}`, { method: 'DELETE' });
      const data = await res.json();
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
          <button type="submit" className="btn" style={{ width: '100%', marginTop: 'var(--space-sm)' }}>Login</button>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            
            {/* Existing Courses List */}
            <div className="glass-card">
              <h3 style={{ marginBottom: 'var(--space-md)' }}>Existing Courses</h3>
              {coursesList.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No courses found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                  {coursesList.map((course) => (
                    <div key={course.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <div>
                        <h4 style={{ color: 'white', marginBottom: '4px' }}>{course.title}</h4>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>₹{(course.price / 100).toFixed(2)} • {course.category}</span>
                      </div>
                      <button onClick={() => handleDeleteCourse(course.id)} className="btn" style={{ background: '#ff5e5e', border: 'none', padding: '6px 12px', fontSize: '0.8rem' }}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Create New Course Form */}
            <div className="glass-card">
              <h3 style={{ marginBottom: 'var(--space-md)' }}>Create New Course</h3>
              <form style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Course Title</label>
                  <input type="text" value={courseTitle} onChange={e => setCourseTitle(e.target.value)} placeholder="e.g. Advanced Mechanics" className="input-field" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Category</label>
                  <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                    <select value={courseCategory} onChange={e => setCourseCategory(e.target.value)} className="input-field" style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }}>
                      <option value="JEE">JEE</option>
                      <option value="NEET">NEET</option>
                      <option value="Foundation">Foundation</option>
                      <option value="custom">Add Custom Category...</option>
                    </select>
                    {courseCategory === 'custom' && (
                      <input type="text" value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="Type new category..." className="input-field" style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }} />
                    )}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Description</label>
                  <textarea rows={4} value={courseDesc} onChange={e => setCourseDesc(e.target.value)} placeholder="Course description..." className="input-field" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }} />
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Price (INR)</label>
                    <input type="number" value={coursePrice} onChange={e => setCoursePrice(e.target.value)} placeholder="999" className="input-field" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Upload Thumbnail (From PC)</label>
                    <input type="file" accept="image/png, image/jpeg, image/webp" onChange={e => setThumbnailFile(e.target.files?.[0] || null)} className="input-field" style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', cursor: 'pointer' }} />
                    <p style={{ fontSize: '0.75rem', color: '#ff5e5e', marginTop: '6px' }}>
                      * Max size: 500 KB. Strict dimensions: 1280x720 px (16:9) to prevent UI breaking.
                    </p>
                  </div>
                </div>
                <button type="button" onClick={handlePublishCourse} disabled={isPublishing} className="btn" style={{ alignSelf: 'flex-start', marginTop: 'var(--space-sm)' }}>
                  {isPublishing ? 'Publishing...' : 'Publish Course'}
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'content' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <div className="glass-card">
              <h3 style={{ marginBottom: 'var(--space-md)' }}>Manage Post-Purchase Content</h3>
              <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                <select value={selectedCourseForContent} onChange={e => setSelectedCourseForContent(e.target.value)} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option value="">Select Target Course</option>
                  {coursesList.map(course => (
                    <option key={course.id} value={course.id}>{course.title}</option>
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
