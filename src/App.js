import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, getDocs, setDoc, getDoc } from 'firebase/firestore';

// Create a context for Firebase and user data
const AppContext = createContext(null);

// ✅ FIX: Local date helper to prevent off-by-one date issue
const getLocalDateString = (dateObj = new Date()) => {
  const year = dateObj.getFullYear();
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const day = dateObj.getDate().toString().padStart(2, '0');
  return `${month}-${day}-${year}`;
};

// Main App Component
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentView, setCurrentView] = useState('projects');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [allTimeEntries, setAllTimeEntries] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalConfirmAction, setModalConfirmAction] = useState(null);

  // Firebase Initialization and Authentication
  useEffect(() => {
    const firebaseConfig = {
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
      authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
      storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.REACT_APP_FIREBASE_APP_ID,
      measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
    };

    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
      console.error("Firebase configuration is missing. Please check your .env file.");
      setModalMessage("Application configuration error. Please ensure Firebase environment variables are set up correctly.");
      setShowModal(true);
      return;
    }

    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
          const userProfileDocRef = doc(firestore, `artifacts/${app.options.projectId}/users/${user.uid}/profile/data`);
          const userProfileSnap = await getDoc(userProfileDocRef);
          if (userProfileSnap.exists()) {
            setUserProfile(userProfileSnap.data());
          } else {
            setUserProfile({ firstName: '', lastName: '', photoURL: '', email: user.email });
            await setDoc(userProfileDocRef, { firstName: '', lastName: '', photoURL: '', email: user.email }, { merge: true });
          }
        } else {
          setUserId(null);
          setUserProfile(null);
        }
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Error initializing Firebase:", error);
      setModalMessage(`Error initializing application: ${error.message}. Please check console for details.`);
      setShowModal(true);
    }
  }, []);

  // Fetch projects and time entries
  useEffect(() => {
    if (db && userId && isAuthReady) {
      const projectsCollectionRef = collection(db, `artifacts/${db.app.options.projectId}/users/${userId}/projects`);
      const unsubscribeProjects = onSnapshot(projectsCollectionRef, (snapshot) => {
        const fetchedProjects = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProjects(fetchedProjects);
      }, (error) => {
        console.error("Error fetching projects:", error);
        showCustomModal("Error loading projects. Please refresh the page.");
      });

      const timeEntriesCollectionRef = collection(db, `artifacts/${db.app.options.projectId}/users/${userId}/timeEntries`);
      const unsubscribeTimeEntries = onSnapshot(timeEntriesCollectionRef, (snapshot) => {
        const fetchedEntries = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          clockInTime: doc.data().clockInTime ? new Date(doc.data().clockInTime) : null,
          clockOutTime: doc.data().clockOutTime ? new Date(doc.data().clockOutTime) : null,
        }));
        setAllTimeEntries(fetchedEntries);
      }, (error) => {
        console.error("Error fetching all time entries:", error);
        showCustomModal("Error loading all time entries.");
      });

      return () => {
        unsubscribeProjects();
        unsubscribeTimeEntries();
      };
    }
  }, [db, userId, isAuthReady]);

  const showCustomModal = useCallback((message, confirmAction = null) => {
    setModalMessage(message);
    setModalConfirmAction(() => confirmAction);
    setShowModal(true);
  }, [setModalMessage, setModalConfirmAction, setShowModal]);

  const handleModalConfirm = () => {
    if (modalConfirmAction) {
      modalConfirmAction();
    }
    setShowModal(false);
    setModalConfirmAction(null);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setModalConfirmAction(null);
  };

  const contextValue = {
    db,
    auth,
    userId,
    userProfile,
    setUserProfile,
    isAuthReady,
    showCustomModal,
    setCurrentView,
    setSelectedProjectId,
    projects,
    setProjects,
    allTimeEntries,
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="text-xl text-gray-700 dark:text-gray-300">Loading application...</div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={contextValue}>
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-inter">
        <header className="bg-white dark:bg-gray-800 shadow-md p-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-blue-600 dark:text-blue-400">Time Tracker</h1>
          {auth && auth.currentUser && (
            <button
                onClick={() => signOut(auth).catch(e => showCustomModal(`Sign out failed: ${e.message}`))}
                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 text-sm"
            >
                Sign Out
            </button>
          )}
        </header>

        <main className="container mx-auto p-4">
          {auth && auth.currentUser ? (
            <>
              {currentView === 'projects' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <ProjectList />
                  </div>
                  <div className="lg:col-span-1">
                    <ProfileSection />
                  </div>
                </div>
              )}
              {currentView === 'detail' && selectedProjectId && <ProjectDetail projectId={selectedProjectId} />}
            </>
          ) : (
            <AuthScreen />
          )}
        </main>

        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full">
              <p className="text-lg mb-4 text-gray-800 dark:text-gray-200">{modalMessage}</p>
              <div className="flex justify-end space-x-3">
                {modalConfirmAction && (
                  <button
                    onClick={handleModalConfirm}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                  >
                    Confirm
                  </button>
                )}
                <button
                  onClick={handleModalClose}
                  className={`px-4 py-2 rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 ${
                    modalConfirmAction ? 'bg-gray-300 text-gray-800 hover:bg-gray-400 focus:ring-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                  }`}
                >
                  {modalConfirmAction ? 'Cancel' : 'OK'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
};

const AuthScreen = () => {
  const { auth, showCustomModal, db, setUserProfile } = useContext(AppContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);

  const handleAuthAction = async () => {
    if (!auth || !db) {
      showCustomModal("Authentication or Database service not ready. Please wait.");
      return;
    }
    if (!email || !password) {
      showCustomModal("Email and password cannot be empty.");
      return;
    }
    if (!isLoginMode && (!firstName.trim() || !lastName.trim())) {
      showCustomModal("First Name and Last Name cannot be empty for sign up.");
      return;
    }

    try {
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, email, password);
        showCustomModal("Logged in successfully!");
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        const userProfileDocRef = doc(db, `artifacts/${db.app.options.projectId}/users/${user.uid}/profile/data`);
        const profileData = {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: user.email,
          photoURL: '',
        };
        await setDoc(userProfileDocRef, profileData, { merge: true });
        setUserProfile(profileData);

        showCustomModal("Account created and logged in successfully!");
      }
    } catch (error) {
      let errorMessage = "An error occurred. Please try again.";
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = "This email is already in use. Try logging in.";
          break;
        case 'auth/invalid-email':
          errorMessage = "Invalid email address format.";
          break;
        case 'auth/weak-password':
          errorMessage = "Password should be at least 6 characters.";
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          errorMessage = "Invalid email or password.";
          break;
        case 'auth/operation-not-allowed':
            errorMessage = "Email/Password authentication is not enabled in Firebase project settings.";
            break;
        default:
          errorMessage = `Authentication error: ${error.message}`;
      }
      showCustomModal(errorMessage);
      console.error("Auth error:", error);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-160px)]">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full">
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900 rounded-md border border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200">
          <p className="space-y-2">
            <span className="block"><span className="font-semibold">Be Your Own Boss of Time</span> – Clock in, clock out, and flex on your to-do list like a legend.</span>
            <span className="block"><span className="font-semibold">Projects? Chores? World Domination?</span> – Track it all. One app, endless slayage.</span>
            <span className="block"><span className="font-semibold">Consistency = Power</span> – Watch your hours add up and feel that productivity glow-up.</span>
          </p>
        </div>

        <h2 className="text-3xl font-bold text-center text-blue-600 dark:text-blue-400 mb-6">
          {isLoginMode ? 'Login' : 'Sign Up'}
        </h2>

        {!isLoginMode && (
          <>
            <div className="mb-4">
              <label htmlFor="firstName" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                First Name:
              </label>
              <input
                type="text"
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 dark:text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
                placeholder="John"
              />
            </div>
            <div className="mb-4">
              <label htmlFor="lastName" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                Last Name:
              </label>
              <input
                type="text"
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 dark:text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
                placeholder="Doe"
              />
            </div>
          </>
        )}

        <div className="mb-4">
          <label htmlFor="email" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
            Email:
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 dark:text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
            placeholder="your@example.com"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="password" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
            Password:
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 dark:text-gray-200 mb-3 leading-tight focus:outline-none focus:shadow-outline bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
            placeholder="********"
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={handleAuthAction}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-md focus:outline-none focus:shadow-outline transition-colors duration-200 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            {isLoginMode ? 'Login' : 'Sign Up'}
          </button>
          <button
            onClick={() => setIsLoginMode(!isLoginMode)}
            className="inline-block align-baseline font-bold text-sm text-blue-500 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-600"
          >
            {isLoginMode ? 'Need an account? Sign Up' : 'Already have an account? Login'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ProfileSection = () => {
  const { db, userId, userProfile, setUserProfile, showCustomModal, allTimeEntries } = useContext(AppContext);
  const [editingPhotoUrl, setEditingPhotoUrl] = useState('');
  const [showPhotoEditModal, setShowPhotoEditModal] = useState(false);

  const calculateDailyTotalAllProjects = (dateString) => {
    const entriesForDay = allTimeEntries.filter((entry) => entry.date === dateString);
    return entriesForDay.reduce((sum, entry) => {
      if (entry.clockInTime && entry.clockOutTime) {
        return sum + (entry.clockOutTime.getTime() - entry.clockInTime.getTime());
      }
      return sum;
    }, 0);
  };

  const calculateWeeklyTotalsAllProjects = () => {
    const weeklyData = {};
    allTimeEntries.forEach((entry) => {
      if (entry.clockInTime && entry.clockOutTime) {
        const entryDate = new Date(entry.clockInTime);
        const dayOfWeek = (entryDate.getDay() + 6) % 7; // Monday as first day
        const startOfWeek = new Date(entryDate);
        startOfWeek.setDate(entryDate.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);
        const weekKey = startOfWeek.toISOString().split('T')[0];

        if (!weeklyData[weekKey]) {
          weeklyData[weekKey] = 0;
        }
        weeklyData[weekKey] += entry.clockOutTime.getTime() - entry.clockInTime.getTime();
      }
    });
    return Object.keys(weeklyData)
      .map((weekKey) => ({
        week: weekKey,
        totalDurationMs: weeklyData[weekKey],
      }))
      .sort((a, b) => new Date(b.week) - new Date(a.week));
  };

  const calculateMonthlyTotalsAllProjects = () => {
    const monthlyData = {};
    allTimeEntries.forEach((entry) => {
      if (entry.clockInTime && entry.clockOutTime) {
        const entryDate = new Date(entry.clockInTime);
        const monthKey = `${entryDate.getFullYear()}-${(entryDate.getMonth() + 1)
          .toString()
          .padStart(2, '0')}`;
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = 0;
        }
        monthlyData[monthKey] += entry.clockOutTime.getTime() - entry.clockInTime.getTime();
      }
    });
    return Object.keys(monthlyData)
      .map((monthKey) => ({
        month: monthKey,
        totalDurationMs: monthlyData[monthKey],
      }))
      .sort((a, b) => new Date(b.month) - new Date(a.month));
  };

  const formatDuration = (ms) => {
    if (ms < 0) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  };

  const today = getLocalDateString();
  const todayTotal = calculateDailyTotalAllProjects(today);

  // ✅ FIX: Only show current week/month, 0 for previous
  const startOfCurrentWeek = new Date();
  const dayOfWeek = (startOfCurrentWeek.getDay() + 6) % 7;
  startOfCurrentWeek.setDate(startOfCurrentWeek.getDate() - dayOfWeek);
  startOfCurrentWeek.setHours(0, 0, 0, 0);
  const currentWeekKey = startOfCurrentWeek.toISOString().split('T')[0];

  const weeklyTotals = calculateWeeklyTotalsAllProjects();
  const monthlyTotals = calculateMonthlyTotalsAllProjects();

  const currentWeekTotal =
    weeklyTotals.find((w) => w.week === currentWeekKey)?.totalDurationMs || 0;

  const currentMonthKey = `${new Date().getFullYear()}-${(new Date().getMonth() + 1)
    .toString()
    .padStart(2, '0')}`;
  const currentMonthTotal =
    monthlyTotals.find((m) => m.month === currentMonthKey)?.totalDurationMs || 0;

  const handleSavePhoto = async () => {
    if (!db || !userId || !userProfile) {
      showCustomModal('Database or user profile not ready.');
      return;
    }
    try {
      const userProfileDocRef = doc(db, `artifacts/${db.app.options.projectId}/users/${userId}/profile/data`);
      const newPhotoURL = editingPhotoUrl.trim().includes('?')
        ? `${editingPhotoUrl.trim()}&_cachebuster=${Date.now()}`
        : `${editingPhotoUrl.trim()}?_cachebuster=${Date.now()}`;

      await updateDoc(userProfileDocRef, { photoURL: newPhotoURL });
      setUserProfile((prev) => ({ ...prev, photoURL: newPhotoURL })); // ✅ force update
      showCustomModal('Profile photo updated successfully!');
      setShowPhotoEditModal(false);
    } catch (e) {
      console.error('Error updating photo URL:', e);
      showCustomModal('Failed to update photo. Please try again.');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-semibold mb-6 text-blue-600 dark:text-blue-400">Your Profile</h2>

      <div className="flex flex-col items-center mb-6">
        <div className="relative w-24 h-24 mb-3">
          <img
            key={userProfile?.photoURL} // ✅ ensures re-render after save
            src={
              userProfile?.photoURL ||
              'https://placehold.co/96x96/cccccc/333333?text=User'
            }
            alt="User Profile"
            className="w-24 h-24 rounded-full border-2 border-blue-500 dark:border-blue-400 object-cover"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src =
                'https://placehold.co/96x96/cccccc/333333?text=User';
            }}
          />
          <button
            onClick={() => {
              setEditingPhotoUrl(userProfile?.photoURL || '');
              setShowPhotoEditModal(true);
            }}
            className="absolute -bottom-0 right-0 p-1 bg-blue-600 rounded-full text-white hover:bg-blue-700 transition-colors duration-200 shadow-md"
            title="Change Photo"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M3 17.25V21h3.75l11-11.03a1 1 0 0 0 0-1.41l-2.3-2.3a1 1 0 0 0-1.41 0l-11.04 11zM14.75 7.04l2.21 2.21"/>
            </svg>
          </button>
        </div>

        <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {userProfile?.firstName} {userProfile?.lastName}
        </p>
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          {userProfile?.email}
        </p>
        <p className="text-gray-600 dark:text-gray-400 text-xs font-mono bg-gray-200 dark:bg-gray-700 p-1 rounded mt-2">
          User ID: {userId}
        </p>
      </div>

      <div className="space-y-2 p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700">
        <h3 className="text-lg font-medium mb-2 text-gray-800 dark:text-gray-200">
          All Projects Totals
        </h3>
        <ul className="divide-y divide-gray-200 dark:divide-gray-600">
          <li className="py-2 flex justify-between items-center text-gray-700 dark:text-gray-300">
            <span className="font-semibold">Today's Total:</span>
            <span className="font-bold text-blue-600 dark:text-blue-400">
              {formatDuration(todayTotal)}
            </span>
          </li>
          <li className="py-2 flex justify-between items-center text-gray-700 dark:text-gray-300">
            <span className="font-semibold">This Week's Total:</span>
            <span className="font-bold text-blue-600 dark:text-blue-400">
              {formatDuration(currentWeekTotal)}
            </span>
          </li>
          <li className="py-2 flex justify-between items-center text-gray-700 dark:text-gray-300">
            <span className="font-semibold">This Month's Total:</span>
            <span className="font-bold text-blue-600 dark:text-blue-400">
              {formatDuration(currentMonthTotal)}
            </span>
          </li>
        </ul>
      </div>

      {showPhotoEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full">
            <h3 className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-4">
              Change Profile Photo
            </h3>
            <div className="mb-4">
              <label
                htmlFor="photoUrl"
                className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2"
              >
                Photo URL:
              </label>
              <input
                type="url"
                id="photoUrl"
                value={editingPhotoUrl}
                onChange={(e) => setEditingPhotoUrl(e.target.value)}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
                placeholder="https://example.com/your-photo.jpg"
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleSavePhoto}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
              >
                Save Photo
              </button>
              <button
                onClick={() => setShowPhotoEditModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ProjectList = () => {
  const { db, userId, showCustomModal, setCurrentView, setSelectedProjectId, projects, setProjects } = useContext(AppContext);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectName, setEditingProjectName] = useState('');

  const addProject = async () => {
    if (!newProjectName.trim()) {
      showCustomModal("Project name cannot be empty.");
      return;
    }
    if (!db || !userId) {
      showCustomModal("Database not ready. Please wait.");
      return;
    }

    try {
      const projectsCollectionRef = collection(db, `artifacts/${db.app.options.projectId}/users/${userId}/projects`);
      await addDoc(projectsCollectionRef, {
        name: newProjectName.trim(),
        createdAt: new Date().toISOString(),
      });
      setNewProjectName('');
      showCustomModal("Project added successfully!");
    } catch (e) {
      console.error("Error adding document: ", e);
      showCustomModal("Failed to add project. Please try again.");
    }
  };

  const startEditingProject = (project) => {
    setEditingProjectId(project.id);
    setEditingProjectName(project.name);
  };

  const updateProject = async (projectId) => {
    if (!editingProjectName.trim()) {
      showCustomModal("Project name cannot be empty.");
      return;
    }
    if (!db || !userId) {
      showCustomModal("Database not ready. Please wait.");
      return;
    }

    try {
      const projectDocRef = doc(db, `artifacts/${db.app.options.projectId}/users/${userId}/projects`, projectId);
      await updateDoc(projectDocRef, {
        name: editingProjectName.trim(),
      });
      setEditingProjectId(null);
      setEditingProjectName('');
      showCustomModal("Project updated successfully!");
    } catch (e) {
      console.error("Error updating document: ", e);
      showCustomModal("Failed to update project. Please try again.");
    }
  };

  const deleteProject = async (projectId) => {
    if (!db || !userId) {
      showCustomModal("Database not ready. Please wait.");
      return;
    }

    showCustomModal("Are you sure you want to delete this project? All associated time entries will also be deleted.", async () => {
      try {
        const timeEntriesQuery = query(collection(db, `artifacts/${db.app.options.projectId}/users/${userId}/timeEntries`));
        const snapshot = await getDocs(timeEntriesQuery);
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
          if (doc.data().projectId === projectId) {
            batch.delete(doc.ref);
          }
        });
        await batch.commit();

        const projectDocRef = doc(db, `artifacts/${db.app.options.projectId}/users/${userId}/projects`, projectId);
        await deleteDoc(projectDocRef);

        showCustomModal("Project and its time entries deleted successfully!");
      } catch (e) {
        console.error("Error deleting project or time entries: ", e);
        showCustomModal("Failed to delete project. Please try again.");
      }
      });
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-semibold mb-6 text-blue-600 dark:text-blue-400">Your Projects</h2>

      <div className="mb-8 p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700">
        <h3 className="text-xl font-medium mb-4 text-gray-800 dark:text-gray-200">Create New Project</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Enter project name"
            className="flex-grow p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addProject}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Add Project
          </button>
        </div>
      </div>

      <div>
        {projects.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400">No projects yet. Create one above!</p>
        ) : (
          <ul className="space-y-4">
            {projects.map((project) => (
              <li
                key={project.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-gray-100 dark:bg-gray-700 rounded-md shadow-sm border border-gray-200 dark:border-gray-600"
              >
                {editingProjectId === project.id ? (
                  <div className="flex-grow flex flex-col sm:flex-row gap-2 w-full">
                    <input
                      type="text"
                      value={editingProjectName}
                      onChange={(e) => setEditingProjectName(e.target.value)}
                      className="flex-grow p-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2 mt-2 sm:mt-0">
                      <button
                        onClick={() => updateProject(project.id)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingProjectId(null)}
                        className="px-4 py-2 bg-gray-400 text-gray-800 rounded-md hover:bg-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="text-xl font-medium text-gray-800 dark:text-gray-200 mb-2 sm:mb-0 flex-grow">{project.name}</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setSelectedProjectId(project.id);
                          setCurrentView('detail');
                        }}
                        className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 text-sm"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => startEditingProject(project)}
                        className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-opacity-50 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteProject(project.id)}
                        className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const ProjectDetail = ({ projectId }) => {
  const { db, userId, showCustomModal, setCurrentView, allTimeEntries } = useContext(AppContext);
  const [projectName, setProjectName] = useState('');
  const [filteredTimeEntries, setFilteredTimeEntries] = useState([]);
  const [clockedIn, setClockedIn] = useState(false);
  const [currentEntryId, setCurrentEntryId] = useState(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(new Date());
  const [selectedFilterDate, setSelectedFilterDate] = useState(null);

  const [showEditTimeEntryModal, setShowEditTimeEntryModal] = useState(false);
  const [editingTimeEntryId, setEditingTimeEntryId] = useState(null);
  const [editingTimeEntryClockIn, setEditingTimeEntryClockIn] = useState('');
  const [editingTimeEntryClockOut, setEditingTimeEntryClockOut] = useState('');
  const [editingTimeEntryNotes, setEditingTimeEntryNotes] = useState('');

  const formatDateTimeLocal = (date) => {
    if (!date) return '';
    const dt = new Date(date);
    const year = dt.getFullYear();
    const month = (dt.getMonth() + 1).toString().padStart(2, '0');
    const day = dt.getDate().toString().padStart(2, '0');
    const hours = dt.getHours().toString().padStart(2, '0');
    const minutes = dt.getMinutes().toString().padStart(2, '0');
    const seconds = dt.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  };

  useEffect(() => {
    if (db && userId && projectId) {
      const projectDocRef = doc(db, `artifacts/${db.app.options.projectId}/users/${userId}/projects`, projectId);
      const unsubscribeProject = onSnapshot(projectDocRef, (docSnap) => {
        if (docSnap.exists()) {
          setProjectName(docSnap.data().name);
        } else {
          setProjectName('Project Not Found');
          showCustomModal("Project not found. Returning to project list.");
          setCurrentView('projects');
        }
      });
      return () => unsubscribeProject();
    }
  }, [db, userId, projectId, setCurrentView, showCustomModal]);

  useEffect(() => {
    const projectSpecificEntries = allTimeEntries.filter((entry) => entry.projectId === projectId);
    // ✅ Default to today's date if no filter is set
    if (!selectedFilterDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setSelectedFilterDate(getLocalDateString(today));
    }
    const filtered = selectedFilterDate
      ? projectSpecificEntries.filter((entry) => entry.date === selectedFilterDate)
      : projectSpecificEntries;

    setFilteredTimeEntries(filtered.sort((a, b) => b.clockInTime - a.clockInTime));
    const lastEntryForThisProject = projectSpecificEntries.find((entry) => !entry.clockOutTime);
    if (lastEntryForThisProject) {
      setClockedIn(true);
      setCurrentEntryId(lastEntryForThisProject.id);
    } else {
      setClockedIn(false);
      setCurrentEntryId(null);
    }
  }, [allTimeEntries, projectId, selectedFilterDate]);


  const handleClockIn = async () => {
    if (!db || !userId) {
      showCustomModal("Database not ready. Please wait.");
      return;
    }
    if (clockedIn) {
      showCustomModal("You are already clocked in for this project.");
      return;
    }

    try {
      const newEntryRef = await addDoc(
        collection(db, `artifacts/${db.app.options.projectId}/users/${userId}/timeEntries`),
        {
          projectId: projectId,
          clockInTime: new Date().toISOString(),
          date: getLocalDateString(),
          clockOutTime: null,
          notes: '',
        }
      );
      setCurrentEntryId(newEntryRef.id);
      setClockedIn(true);
      showCustomModal("Clocked in successfully!");
    } catch (e) {
      console.error("Error clocking in: ", e);
      showCustomModal("Failed to clock in. Please try again.");
    }
  };

  const handleClockOut = async () => {
    if (!db || !userId) {
      showCustomModal("Database not ready. Please wait.");
      return;
    }
    if (!clockedIn || !currentEntryId) {
      showCustomModal("You are not currently clocked in for this project.");
      return;
    }

    try {
      const entryDocRef = doc(db, `artifacts/${db.app.options.projectId}/users/${userId}/timeEntries`, currentEntryId);
      await updateDoc(entryDocRef, {
        clockOutTime: new Date().toISOString(),
      });
      setClockedIn(false);
      setCurrentEntryId(null);
      showCustomModal("Clocked out successfully!");
    } catch (e) {
      console.error("Error clocking out: ", e);
      showCustomModal("Failed to clock out. Please try again.");
    }
  };

  const deleteTimeEntry = async (entryId) => {
    showCustomModal("Are you sure you want to delete this time entry?", async () => {
      if (!db || !userId) {
        showCustomModal("Database not ready. Please wait.");
        return;
      }
      try {
        const entryDocRef = doc(db, `artifacts/${db.app.options.projectId}/users/${userId}/timeEntries`, entryId);
        await deleteDoc(entryDocRef);
        showCustomModal("Time entry deleted successfully!");
      } catch (e) {
        console.error("Error deleting time entry: ", e);
        showCustomModal("Failed to delete time entry. Please try again.");
      }
    });
  };

  const startEditingTimeEntry = (entry) => {
    setEditingTimeEntryId(entry.id);
    setEditingTimeEntryClockIn(formatDateTimeLocal(entry.clockInTime));
    setEditingTimeEntryClockOut(formatDateTimeLocal(entry.clockOutTime));
    setEditingTimeEntryNotes(entry.notes || '');
    setShowEditTimeEntryModal(true);
  };

  const handleUpdateTimeEntry = async () => {
    if (!db || !userId || !editingTimeEntryId) {
      showCustomModal("Database or entry not ready for update.");
      return;
    }
    if (!editingTimeEntryClockIn) {
      showCustomModal("Clock-in time cannot be empty.");
      return;
    }

    const newClockInDate = new Date(editingTimeEntryClockIn);
    const newClockOutDate = editingTimeEntryClockOut ? new Date(editingTimeEntryClockOut) : null;

    if (newClockOutDate && newClockOutDate < newClockInDate) {
      showCustomModal("Clock-out time cannot be before clock-in time.");
      return;
    }

    try {
      const entryDocRef = doc(db, `artifacts/${db.app.options.projectId}/users/${userId}/timeEntries`, editingTimeEntryId);
      await updateDoc(entryDocRef, {
        clockInTime: newClockInDate.toISOString(),
        clockOutTime: newClockOutDate ? newClockOutDate.toISOString() : null,
        date: getLocalDateString(newClockInDate),
        notes: editingTimeEntryNotes.trim(),
      });
      setShowEditTimeEntryModal(false);
      setEditingTimeEntryId(null);
      setEditingTimeEntryClockIn('');
      setEditingTimeEntryClockOut('');
      setEditingTimeEntryNotes('');
      showCustomModal("Time entry updated successfully!");
    } catch (e) {
      console.error("Error updating time entry: ", e);
      showCustomModal("Failed to update time entry. Please try again.");
    }
  };

  const formatDuration = (ms) => {
    if (ms < 0) return "N/A";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  };

  const calculateEntryDuration = (entry) => {
    if (entry.clockInTime && entry.clockOutTime) {
      return entry.clockOutTime.getTime() - entry.clockInTime.getTime();
    }
    return 0;
  };

  const groupedEntries = filteredTimeEntries.reduce((acc, entry) => {
    const dateKey = getLocalDateString(entry.clockInTime);
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(entry);
    return acc;
  }, {});

  const dailyTotals = Object.keys(groupedEntries).map(dateKey => {
    const entriesForDay = groupedEntries[dateKey];
    const totalDurationMs = entriesForDay.reduce((sum, entry) => sum + calculateEntryDuration(entry), 0);
    return { date: dateKey, totalDurationMs };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const year = selectedCalendarDate.getFullYear();
  const month = selectedCalendarDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;

  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }

  // ✅ FIX 1: Correct date selection
  const handleDateClick = (day) => {
    if (!day) return; // ignore empty slots
    const clickedDate = new Date(year, month, day);
    clickedDate.setHours(0, 0, 0, 0);
    const newDateString = getLocalDateString(clickedDate);
    // ✅ Always set, even if the same date is clicked again
    setSelectedFilterDate(newDateString);
  };

  const goToPreviousMonth = useCallback(() => {
    setSelectedCalendarDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
    setSelectedFilterDate(null);
  }, []);

  const goToNextMonth = useCallback(() => {
    setSelectedCalendarDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
    setSelectedFilterDate(null);
  }, []);

  // ✅ FIX 2: Weekly total based on selectedFilterDate (if present)
  const getSelectedWeekTotal = useCallback(() => {
    const referenceDate = selectedFilterDate
      ? new Date(selectedFilterDate)
      : selectedCalendarDate;

    const dayOfWeek = (referenceDate.getDay() + 6) % 7;
    const startOfWeek = new Date(referenceDate);
    startOfWeek.setDate(referenceDate.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    return allTimeEntries
      .filter((entry) => entry.projectId === projectId)
      .reduce((sum, entry) => {
        if (entry.clockInTime && entry.clockOutTime) {
          const entryTime = entry.clockInTime.getTime();
          if (entryTime >= startOfWeek.getTime() && entryTime < endOfWeek.getTime()) {
            return sum + (entry.clockOutTime.getTime() - entry.clockInTime.getTime());
          }
        }
        return sum;
      }, 0);
  }, [selectedFilterDate, selectedCalendarDate, allTimeEntries, projectId]);

  // ✅ FIX 3: Monthly total based on selectedFilterDate (if present)
  const getSelectedMonthTotal = useCallback(() => {
    const referenceDate = selectedFilterDate
      ? new Date(selectedFilterDate)
      : selectedCalendarDate;

    const startOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);
    const endOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);
    endOfMonth.setHours(0, 0, 0, 0);

    return allTimeEntries
      .filter((entry) => entry.projectId === projectId)
      .reduce((sum, entry) => {
        if (entry.clockInTime && entry.clockOutTime) {
          const entryTime = entry.clockInTime.getTime();
          if (entryTime >= startOfMonth.getTime() && entryTime < endOfMonth.getTime()) {
            return sum + (entry.clockOutTime.getTime() - entry.clockInTime.getTime());
          }
        }
        return sum;
      }, 0);
  }, [selectedFilterDate, selectedCalendarDate, allTimeEntries, projectId]);

  const selectedWeekTotal = getSelectedWeekTotal();
  const selectedMonthTotal = getSelectedMonthTotal();

  // 🔥 The rest of your render logic (calendar, entries list, totals, edit modal) REMAINS THE SAME as before 🔥
  // ...
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => { setCurrentView('projects'); setSelectedFilterDate(null); }}
          className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-400 dark:hover:bg-gray-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
        >
          &larr; Back to Projects
        </button>
        <h2 className="text-3xl font-bold text-blue-600 dark:text-blue-400">{projectName}</h2>
        <div></div>
      </div>

      <div className="mb-8 p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700 flex flex-col sm:flex-row items-center justify-center gap-4">
        <span className="text-xl font-medium text-gray-800 dark:text-gray-200">
          Status: <span className={`font-semibold ${clockedIn ? 'text-blue-600' : 'text-red-600'}`}>
            {clockedIn ? 'Clocked In' : 'Clocked Out'}
          </span>
        </span>
        <button
          onClick={handleClockIn}
          disabled={clockedIn}
          className={`px-6 py-3 rounded-md shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-opacity-50 ${
            clockedIn
              ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
          }`}
        >
          Clock In
        </button>
        <button
          onClick={handleClockOut}
          disabled={!clockedIn}
          className={`px-6 py-3 rounded-md shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-opacity-50 ${
            !clockedIn
              ? 'bg-gray-400 text-gray-700 dark:text-gray-700 cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
          }`}
        >
          Clock Out
        </button>
      </div>

      <div className="mb-8 p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700">
        <h3 className="text-xl font-medium mb-4 text-gray-800 dark:text-gray-200">Calendar</h3>
        <div className="flex justify-between items-center mb-4">
          <button onClick={goToPreviousMonth} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            {selectedCalendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={goToNextMonth} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="grid grid-cols-7 gap-2 text-center text-sm">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div key={day} className="font-semibold text-gray-600 dark:text-gray-400">{day}</div>
          ))}
          {calendarDays.map((day, index) => {
            const fullDate = day ? new Date(year, month, day) : null;
            const dateString = fullDate ? getLocalDateString(fullDate) : null;
            const isToday = fullDate && fullDate.toDateString() === new Date().toDateString();
            const isSelected = selectedFilterDate && dateString === selectedFilterDate;
            const dailyTotal = allTimeEntries.filter(entry => entry.date === dateString && entry.projectId === projectId)
                                            .reduce((sum, entry) => sum + calculateEntryDuration(entry), 0);

            return (
              <div
                key={index}
                className={`p-2 rounded-md cursor-pointer ${day ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600' : 'bg-gray-100 dark:bg-gray-900'} ${isToday ? 'ring-2 ring-blue-500' : ''} ${isSelected ? 'bg-blue-200 dark:bg-blue-700 ring-2 ring-blue-500' : ''}`}
                onClick={() => handleDateClick(day)}
              >
                <span className="font-medium">{day}</span>
                {day && dailyTotal > 0 && (
                  <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    {formatDuration(dailyTotal)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {selectedFilterDate && (
            <div className="text-center mt-4">
                <button
                    onClick={() => setSelectedFilterDate(null)}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
                >
                    Show All Entries
                </button>
            </div>
        )}
      </div>

      <div className="mb-8 p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700">
        <h3 className="text-xl font-medium mb-4 text-gray-800 dark:text-gray-200">
            {selectedFilterDate
              ? `Time Entries for ${selectedFilterDate}`
              : 'Recent Time Entries'}
        </h3>
        {filteredTimeEntries.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400">
            {selectedFilterDate
              ? `No time entries`
              : 'No time entries yet for this project.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {filteredTimeEntries.map(entry => (
              <li key={entry.id} className="p-3 bg-white dark:bg-gray-800 rounded-md shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">Date: {getLocalDateString(entry.clockInTime)}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Clock In: {entry.clockInTime ? entry.clockInTime.toLocaleTimeString() : 'N/A'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Clock Out: {entry.clockOutTime ? entry.clockOutTime.toLocaleTimeString() : 'Still Clocked In'}
                  </p>
                  {entry.notes && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                      Notes: <span className="italic">{entry.notes}</span>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
                    {entry.clockOutTime && (
                        <button
                            onClick={() => startEditingTimeEntry(entry)}
                            className="px-3 py-1 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-opacity-50 text-xs"
                        >
                            Edit
                        </button>
                    )}
                    <button
                        onClick={() => deleteTimeEntry(entry.id)}
                        className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 text-xs"
                    >
                        Delete
                    </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700">
          <h3 className="text-xl font-medium mb-4 text-gray-800 dark:text-gray-200">Daily Total</h3>
          {dailyTotals.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400">No daily data.</p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {dailyTotals.map(item => (
                <li key={item.date} className="flex justify-between text-gray-700 dark:text-gray-300">
                  <span>{item.date}</span>
                  <span className="font-semibold">{formatDuration(item.totalDurationMs)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Updated Weekly Total section */}
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700">
          <h3 className="text-xl font-medium mb-4 text-gray-800 dark:text-gray-200">Weekly Totals</h3>
          {selectedWeekTotal <= 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400">No weekly data.</p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              <li className="flex justify-between text-gray-700 dark:text-gray-300">
                <span>
                  Week of {
                    (() => {
                      const referenceDate = new Date(selectedFilterDate || selectedCalendarDate);
                      const dayOfWeek = (referenceDate.getDay() + 6) % 7; // Monday as first day
                      const monday = new Date(referenceDate);
                      monday.setDate(referenceDate.getDate() - dayOfWeek);
                      return monday.toLocaleDateString('en-US', {
                        month: 'numeric',
                        day: 'numeric',
                        year: 'numeric'
                      });
                    })()
                  }
                </span>
                <span className="font-semibold">{formatDuration(selectedWeekTotal)}</span>
              </li>
            </ul>
          )}
        </div>

        {/* Updated Monthly Total section */}
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700">
          <h3 className="text-xl font-medium mb-4 text-gray-800 dark:text-gray-200">Monthly Totals</h3>
          {selectedMonthTotal <= 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400">No monthly data.</p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              <li className="flex justify-between text-gray-700 dark:text-gray-300">
                <span>{new Date(selectedFilterDate || selectedCalendarDate)
                  .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                <span className="font-semibold">{formatDuration(selectedMonthTotal)}</span>
              </li>
            </ul>
          )}
        </div>
      </div>

      {showEditTimeEntryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-4">Edit Time Entry</h3>
            <div className="mb-4">
              <label htmlFor="editClockIn" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                Clock In:
              </label>
              <input
                type="datetime-local"
                id="editClockIn"
                value={editingTimeEntryClockIn}
                onChange={(e) => setEditingTimeEntryClockIn(e.target.value)}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="mb-4">
              <label htmlFor="editClockOut" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                Clock Out:
              </label>
              <input
                type="datetime-local"
                id="editClockOut"
                value={editingTimeEntryClockOut}
                onChange={(e) => setEditingTimeEntryClockOut(e.target.value)}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave blank if still clocked in.</p>
            </div>
            <div className="mb-6">
              <label htmlFor="editNotes" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                Notes:
              </label>
              <textarea
                id="editNotes"
                value={editingTimeEntryNotes}
                onChange={(e) => setEditingTimeEntryNotes(e.target.value)}
                placeholder="Add notes for this time entry..."
                rows="3"
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
              ></textarea>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleUpdateTimeEntry}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
              >
                Save Changes
              </button>
              <button
                onClick={() => setShowEditTimeEntryModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
