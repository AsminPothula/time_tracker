import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth'; // Removed signInAnonymously
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';

// Create a context for Firebase and user data
const AppContext = createContext(null);

// Main App Component
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentView, setCurrentView] = useState('projects'); // 'projects' or 'detail'
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalConfirmAction, setModalConfirmAction] = useState(null);

  // Firebase Initialization and Authentication
  useEffect(() => {
    // Firebase Configuration loaded from environment variables
    // IMPORTANT: These variables must be prefixed with REACT_APP_ in your .env file
    const firebaseConfig = {
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
      authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
      storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.REACT_APP_FIREBASE_APP_ID,
      measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
    };

    // Basic validation for Firebase config
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

      // Listen for auth state changes
      const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
        if (user) {
          // A user is logged in (via email/password or other explicit method)
          setUserId(user.uid);
        } else {
          // No user is logged in. User must explicitly sign in.
          setUserId(null);
        }
        setIsAuthReady(true);
      });

      return () => unsubscribe(); // Cleanup auth listener on component unmount
    } catch (error) {
      console.error("Error initializing Firebase:", error);
      setModalMessage(`Error initializing application: ${error.message}. Please check console for details.`);
      setShowModal(true);
    }
  }, []); // Empty dependency array means this effect runs once on component mount

  // Fetch projects when auth and db are ready
  useEffect(() => {
    if (db && userId && isAuthReady) {
      // Use the actual projectId from the initialized Firebase app for the Firestore path
      // db.app.options.projectId correctly references the projectId from your firebaseConfig
      const projectsCollectionRef = collection(db, `artifacts/${db.app.options.projectId}/users/${userId}/projects`);
      // Using onSnapshot for real-time updates
      const unsubscribe = onSnapshot(projectsCollectionRef, (snapshot) => {
        const fetchedProjects = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProjects(fetchedProjects);
      }, (error) => {
        console.error("Error fetching projects:", error);
        setModalMessage("Error loading projects. Please refresh the page.");
        setShowModal(true);
      });
      return () => unsubscribe(); // Cleanup listener
    }
  }, [db, userId, isAuthReady]); // Dependencies ensure this runs when db, userId, or auth state changes

  // Function to show a custom modal message (wrapped in useCallback for stability)
  const showCustomModal = useCallback((message, confirmAction = null) => {
    setModalMessage(message);
    setModalConfirmAction(() => confirmAction); // Store the action to be executed on confirm
    setShowModal(true);
  }, [setModalMessage, setModalConfirmAction, setShowModal]); // Dependencies for useCallback

  // Function to handle modal confirmation
  const handleModalConfirm = () => {
    if (modalConfirmAction) {
      modalConfirmAction();
    }
    setShowModal(false);
    setModalConfirmAction(null);
  };

  // Function to handle modal close (cancel)
  const handleModalClose = () => {
    setShowModal(false);
    setModalConfirmAction(null);
  };

  // Context value
  const contextValue = {
    db,
    auth,
    userId,
    isAuthReady,
    showCustomModal,
    setCurrentView,
    setSelectedProjectId,
    projects,
    setProjects,
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
          {/* Only show User ID and Sign Out button if a user is authenticated (not null) */}
          {auth && auth.currentUser && ( // Check auth.currentUser to ensure a user is truly logged in
            <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                    User ID: <span className="font-mono bg-gray-200 dark:bg-gray-700 p-1 rounded">{auth.currentUser.uid}</span>
                </div>
                <button
                    onClick={() => signOut(auth).catch(e => showCustomModal(`Sign out failed: ${e.message}`))}
                    className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 text-sm"
                >
                    Sign Out
                </button>
            </div>
          )}
        </header>

        <main className="container mx-auto p-4">
          {auth && auth.currentUser ? ( // Check auth.currentUser to ensure a user is truly logged in
            <>
              {currentView === 'projects' && <ProjectList />}
              {currentView === 'detail' && selectedProjectId && <ProjectDetail projectId={selectedProjectId} />}
            </>
          ) : (
            <AuthScreen />
          )}
        </main>

        {/* Custom Modal Component */}
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

// AuthScreen Component for Login/Signup
const AuthScreen = () => {
  const { auth, showCustomModal } = useContext(AppContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true); // true for login, false for signup

  const handleAuthAction = async () => {
    if (!auth) {
      showCustomModal("Authentication service not ready. Please wait.");
      return;
    }
    if (!email || !password) {
      showCustomModal("Email and password cannot be empty.");
      return;
    }

    try {
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, email, password);
        showCustomModal("Logged in successfully!");
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
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
    <div className="flex items-center justify-center min-h-[calc(100vh-160px)]"> {/* Adjusted height to fit */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-3xl font-bold text-center text-blue-600 dark:text-blue-400 mb-6">
          {isLoginMode ? 'Login' : 'Sign Up'}
        </h2>

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

// ProjectList Component
const ProjectList = () => {
  const { db, userId, showCustomModal, setCurrentView, setSelectedProjectId, projects, setProjects } = useContext(AppContext);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectName, setEditingProjectName] = useState('');

  // Function to add a new project
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
      // Use the actual projectId from the initialized Firebase app for the Firestore path
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

  // Function to start editing a project
  const startEditingProject = (project) => {
    setEditingProjectId(project.id);
    setEditingProjectName(project.name);
  };

  // Function to update a project
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
      // Use the actual projectId from the initialized Firebase app for the Firestore path
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

  // Function to delete a project
  const deleteProject = async (projectId) => {
    if (!db || !userId) {
      showCustomModal("Database not ready. Please wait.");
      return;
    }

    showCustomModal("Are you sure you want to delete this project? All associated time entries will also be deleted.", async () => {
      try {
        // Delete time entries first
        // Use the actual projectId from the initialized Firebase app for the Firestore path
        const timeEntriesQuery = query(collection(db, `artifacts/${db.app.options.projectId}/users/${userId}/timeEntries`));
        const snapshot = await getDocs(timeEntriesQuery);
        const batch = db.batch(); // Use a batch for multiple deletes
        snapshot.docs.forEach(doc => {
          if (doc.data().projectId === projectId) { // Filter by projectId
            batch.delete(doc.ref);
          }
        });
        await batch.commit();

        // Then delete the project itself
        // Use the actual projectId from the initialized Firebase app for the Firestore path
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

      {/* Add New Project */}
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

      {/* Project List */}
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

// ProjectDetail Component (Placeholder for now, will be implemented next)
const ProjectDetail = ({ projectId }) => {
  const { db, userId, showCustomModal, setCurrentView } = useContext(AppContext);
  const [projectName, setProjectName] = useState('');
  const [timeEntries, setTimeEntries] = useState([]);
  const [clockedIn, setClockedIn] = useState(false);
  const [currentEntryId, setCurrentEntryId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());

  // New state for editing time entries
  const [showEditTimeEntryModal, setShowEditTimeEntryModal] = useState(false);
  const [editingTimeEntryId, setEditingTimeEntryId] = useState(null);
  const [editingTimeEntryClockIn, setEditingTimeEntryClockIn] = useState('');
  const [editingTimeEntryClockOut, setEditingTimeEntryClockOut] = useState('');

  // Helper to format Date objects to 'YYYY-MM-DDTHH:MM' for datetime-local input
  const formatDateTimeLocal = (date) => {
    if (!date) return '';
    const dt = new Date(date);
    dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset()); // Adjust for timezone
    return dt.toISOString().slice(0, 16);
  };

  // Fetch project name and time entries
  useEffect(() => {
    if (db && userId && projectId) {
      // Fetch project name
      // Use the actual projectId from the initialized Firebase app for the Firestore path
      const projectDocRef = doc(db, `artifacts/${db.app.options.projectId}/users/${userId}/projects`, projectId);
      const unsubscribeProject = onSnapshot(projectDocRef, (docSnap) => {
        if (docSnap.exists()) {
          setProjectName(docSnap.data().name);
        } else {
          setProjectName('Project Not Found');
          showCustomModal("Project not found. Returning to project list.");
          setCurrentView('projects');
        }
      }, (error) => {
        console.error("Error fetching project name:", error);
        showCustomModal("Error fetching project details.");
      });

      // Fetch time entries for this project
      // Use the actual projectId from the initialized Firebase app for the Firestore path
      const q = query(
        collection(db, `artifacts/${db.app.options.projectId}/users/${userId}/timeEntries`),
        // orderBy('clockInTime', 'desc') // Sorting will be done client-side for now
      );
      const unsubscribeEntries = onSnapshot(q, (snapshot) => {
        const fetchedEntries = snapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data(),
            // Convert Firestore Timestamps to Date objects if they exist
            clockInTime: doc.data().clockInTime ? new Date(doc.data().clockInTime) : null,
            clockOutTime: doc.data().clockOutTime ? new Date(doc.data().clockOutTime) : null,
          }))
          .filter(entry => entry.projectId === projectId) // Filter client-side
          .sort((a, b) => b.clockInTime - a.clockInTime); // Sort by clockInTime descending

        setTimeEntries(fetchedEntries);

        // Check if currently clocked in
        const lastEntry = fetchedEntries.find(entry => !entry.clockOutTime);
        if (lastEntry) {
          setClockedIn(true);
          setCurrentEntryId(lastEntry.id);
        } else {
          setClockedIn(false);
          setCurrentEntryId(null);
        }
      }, (error) => {
        console.error("Error fetching time entries:", error);
        showCustomModal("Error loading time entries.");
      });

      return () => {
        unsubscribeProject();
        unsubscribeEntries();
      };
    }
  }, [db, userId, projectId, setCurrentView, showCustomModal]);

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
      // Use the actual projectId from the initialized Firebase app for the Firestore path
      const newEntryRef = await addDoc(collection(db, `artifacts/${db.app.options.projectId}/users/${userId}/timeEntries`), {
        projectId: projectId,
        clockInTime: new Date().toISOString(), // Store as ISO string
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format for easy grouping
        clockOutTime: null,
      });
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
      // Use the actual projectId from the initialized Firebase app for the Firestore path
      const entryDocRef = doc(db, `artifacts/${db.app.options.projectId}/users/${userId}/timeEntries`, currentEntryId);
      await updateDoc(entryDocRef, {
        clockOutTime: new Date().toISOString(), // Store as ISO string
      });
      setClockedIn(false);
      setCurrentEntryId(null);
      showCustomModal("Clocked out successfully!");
    } catch (e) {
      console.error("Error clocking out: ", e);
      showCustomModal("Failed to clock out. Please try again.");
    }
  };

  // Function to delete a time entry
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

  // Function to start editing a time entry
  const startEditingTimeEntry = (entry) => {
    setEditingTimeEntryId(entry.id);
    setEditingTimeEntryClockIn(formatDateTimeLocal(entry.clockInTime));
    setEditingTimeEntryClockOut(formatDateTimeLocal(entry.clockOutTime));
    setShowEditTimeEntryModal(true);
  };

  // Function to handle updating a time entry
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
        date: newClockInDate.toISOString().split('T')[0], // Update date if clock-in time changes day
      });
      setShowEditTimeEntryModal(false);
      setEditingTimeEntryId(null);
      setEditingTimeEntryClockIn('');
      setEditingTimeEntryClockOut('');
      showCustomModal("Time entry updated successfully!");
    } catch (e) {
      console.error("Error updating time entry: ", e);
      showCustomModal("Failed to update time entry. Please try again.");
    }
  };

  // Helper to format duration
  const formatDuration = (ms) => {
    if (ms < 0) return "N/A";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  };

  // Calculate total duration for an entry
  const calculateEntryDuration = (entry) => {
    if (entry.clockInTime && entry.clockOutTime) {
      return entry.clockOutTime.getTime() - entry.clockInTime.getTime();
    }
    return 0;
  };

  // Group entries by day for display
  const groupedEntries = timeEntries.reduce((acc, entry) => {
    const dateKey = entry.date; // YYYY-MM-DD
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(entry);
    return acc;
  }, {});

  // Calculate daily totals
  const dailyTotals = Object.keys(groupedEntries).map(dateKey => {
    const entriesForDay = groupedEntries[dateKey];
    const totalDurationMs = entriesForDay.reduce((sum, entry) => sum + calculateEntryDuration(entry), 0);
    return { date: dateKey, totalDurationMs };
  }).sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date descending

  // Calendar logic (simplified for now)
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay(); // 0 for Sunday, 1 for Monday

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month); // Day of the week for the 1st of the month

  const calendarDays = [];
  // Add empty placeholders for days before the 1st of the month
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }
  // Add actual days
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }

  // Calculate weekly totals
  const calculateWeeklyTotals = () => {
    const weeklyData = {};
    timeEntries.forEach(entry => {
      if (entry.clockInTime && entry.clockOutTime) {
        const entryDate = new Date(entry.clockInTime);
        const startOfWeek = new Date(entryDate);
        startOfWeek.setDate(entryDate.getDate() - entryDate.getDay()); // Sunday as start of week
        startOfWeek.setHours(0, 0, 0, 0);
        const weekKey = startOfWeek.toISOString().split('T')[0]; // Use start of week as key

        if (!weeklyData[weekKey]) {
          weeklyData[weekKey] = 0;
        }
        weeklyData[weekKey] += calculateEntryDuration(entry);
      }
    });

    return Object.keys(weeklyData).map(weekKey => ({
      week: weekKey,
      totalDurationMs: weeklyData[weekKey],
    })).sort((a, b) => new Date(b.week) - new Date(a.week));
  };

  const weeklyTotals = calculateWeeklyTotals();

  // Calculate monthly totals
  const calculateMonthlyTotals = () => {
    const monthlyData = {};
    timeEntries.forEach(entry => {
      if (entry.clockInTime && entry.clockOutTime) {
        const entryDate = new Date(entry.clockInTime);
        const monthKey = `${entryDate.getFullYear()}-${(entryDate.getMonth() + 1).toString().padStart(2, '0')}`; // YYYY-MM
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = 0;
        }
        monthlyData[monthKey] += calculateEntryDuration(entry);
      }
    });
    return Object.keys(monthlyData).map(monthKey => ({
      month: monthKey,
      totalDurationMs: monthlyData[monthKey],
    })).sort((a, b) => new Date(b.month) - new Date(a.month));
  };

  const monthlyTotals = calculateMonthlyTotals();

  const goToPreviousMonth = () => {
    setSelectedDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  };

  const goToNextMonth = () => {
    setSelectedDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setCurrentView('projects')}
          className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-400 dark:hover:bg-gray-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
        >
          &larr; Back to Projects
        </button>
        <h2 className="text-3xl font-bold text-blue-600 dark:text-blue-400">{projectName}</h2>
        <div></div> {/* Placeholder for alignment */}
      </div>

      {/* Clock In/Out Section */}
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
              ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
          }`}
        >
          Clock Out
        </button>
      </div>

      {/* Calendar View */}
      <div className="mb-8 p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700">
        <h3 className="text-xl font-medium mb-4 text-gray-800 dark:text-gray-200">Calendar</h3>
        <div className="flex justify-between items-center mb-4">
          <button onClick={goToPreviousMonth} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            {selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={goToNextMonth} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="grid grid-cols-7 gap-2 text-center text-sm">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="font-semibold text-gray-600 dark:text-gray-400">{day}</div>
          ))}
          {calendarDays.map((day, index) => {
            const fullDate = day ? new Date(year, month, day) : null;
            const dateString = fullDate ? fullDate.toISOString().split('T')[0] : null;
            const isToday = fullDate && fullDate.toDateString() === new Date().toDateString();
            const dailyTotal = dailyTotals.find(d => d.date === dateString);

            return (
              <div
                key={index}
                className={`p-2 rounded-md ${day ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600' : 'bg-gray-100 dark:bg-gray-900'} ${isToday ? 'ring-2 ring-blue-500' : ''}`}
              >
                <span className="font-medium">{day}</span>
                {dailyTotal && day && (
                  <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    {formatDuration(dailyTotal.totalDurationMs)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Time Entries List */}
      <div className="mb-8 p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700">
        <h3 className="text-xl font-medium mb-4 text-gray-800 dark:text-gray-200">Recent Time Entries</h3>
        {timeEntries.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400">No time entries yet for this project.</p>
        ) : (
          <ul className="space-y-3">
            {timeEntries.slice(0, 10).map(entry => ( // Show last 10 entries
              <li key={entry.id} className="p-3 bg-white dark:bg-gray-800 rounded-md shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">Date: {new Date(entry.date).toLocaleDateString()}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Clock In: {entry.clockInTime ? entry.clockInTime.toLocaleTimeString() : 'N/A'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Clock Out: {entry.clockOutTime ? entry.clockOutTime.toLocaleTimeString() : 'Still Clocked In'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
                    {entry.clockOutTime && ( // Only show edit button if clocked out
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

      {/* Summary Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Daily Summary */}
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700">
          <h3 className="text-xl font-medium mb-4 text-gray-800 dark:text-gray-200">Daily Totals</h3>
          {dailyTotals.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400">No daily data.</p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {dailyTotals.map(item => (
                <li key={item.date} className="flex justify-between text-gray-700 dark:text-gray-300">
                  <span>{new Date(item.date).toLocaleDateString()}</span>
                  <span className="font-semibold">{formatDuration(item.totalDurationMs)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Weekly Summary */}
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700">
          <h3 className="text-xl font-medium mb-4 text-gray-800 dark:text-gray-200">Weekly Totals</h3>
          {weeklyTotals.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400">No weekly data.</p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {weeklyTotals.map(item => (
                <li key={item.week} className="flex justify-between text-gray-700 dark:text-gray-300">
                  <span>Week of {new Date(item.week).toLocaleDateString()}</span>
                  <span className="font-semibold">{formatDuration(item.totalDurationMs)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Monthly Summary */}
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700">
          <h3 className="text-xl font-medium mb-4 text-gray-800 dark:text-gray-200">Monthly Totals</h3>
          {monthlyTotals.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400">No monthly data.</p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {monthlyTotals.map(item => (
                <li key={item.month} className="flex justify-between text-gray-700 dark:text-gray-300">
                  <span>{new Date(item.month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                  <span className="font-semibold">{formatDuration(item.totalDurationMs)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Edit Time Entry Modal */}
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
            <div className="mb-6">
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
