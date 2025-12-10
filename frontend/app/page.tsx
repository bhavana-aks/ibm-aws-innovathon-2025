// 07-12-25: Added project creation and management UI for Phase 3
// 15-01-25: Added authentication UI and logout functionality
'use client';

import { useState } from 'react';
import FileUpload from '@/components/file-upload';
import NewProjectModal from '@/components/new-project-modal';
import ProjectsList from '@/components/projects-list';
import ScriptEditor from '@/components/script-editor';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

type View = 'dashboard' | 'editor';

export default function Home() {
  const { user, tenantId, isLoading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'projects' | 'library'>('projects');
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleProjectCreated = (projectId: string) => {
    setRefreshTrigger(prev => prev + 1);
    setSelectedProjectId(projectId);
    setView('editor');
  };

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setView('editor');
  };

  const handleBackToDashboard = () => {
    setSelectedProjectId(null);
    setView('dashboard');
    setRefreshTrigger(prev => prev + 1);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div 
              className="cursor-pointer" 
              onClick={() => view !== 'dashboard' && handleBackToDashboard()}
            >
              <h1 className="text-2xl font-bold text-gray-900">Video SaaS Platform</h1>
              <p className="text-sm text-gray-600 mt-1">Generate synchronized video tutorials</p>
            </div>
            <div className="flex items-center gap-4">
              {user && (
                <div className="text-sm text-gray-600">
                  <div className="font-medium">{user.username}</div>
                  {tenantId && (
                    <div className="text-xs text-gray-500">Tenant: {tenantId}</div>
                  )}
                </div>
              )}
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {view === 'dashboard' ? (
          <>
            {/* Tab Navigation */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex border-b border-gray-200">
                <button
                  onClick={() => setActiveTab('projects')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'projects'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z" />
                    </svg>
                    Projects
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('library')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'library'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7Z" />
                    </svg>
                    Asset Library
                  </span>
                </button>
              </div>

              {activeTab === 'projects' && (
                <button
                  onClick={() => setShowNewProjectModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" />
                  </svg>
                  New Project
                </button>
              )}
            </div>

            {/* Content */}
            <div className="bg-white rounded-lg shadow p-6">
              {activeTab === 'projects' ? (
                <>
                  <h2 className="text-xl font-semibold mb-4">Your Projects</h2>
                  <p className="text-gray-600 mb-6">
                    Create video tutorials from your PDF guides and Playwright test scripts.
                  </p>
                  <ProjectsList 
                    onSelectProject={handleSelectProject}
                    refreshTrigger={refreshTrigger}
                  />
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold mb-4">Asset Library</h2>
                  <p className="text-gray-600 mb-6">
                    Upload PDF guides or Playwright test scripts to use in your video projects.
                  </p>
                  <FileUpload />
                </>
              )}
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow p-6">
            {selectedProjectId && (
              <ScriptEditor 
                projectId={selectedProjectId} 
                onBack={handleBackToDashboard}
              />
            )}
          </div>
        )}
      </div>

      {/* New Project Modal */}
      <NewProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onProjectCreated={handleProjectCreated}
      />
    </div>
  );
}
