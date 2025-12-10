// 07-12-25: Fixed project creation to pass tenantId header to API
// 07-12-25: Created new project modal with file selection and prompt input
'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import FileLibrary from './file-library';
import SelectedFilesList from './selected-files-list';
import { CreateProjectRequest } from '@/types/project';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (projectId: string) => void;
}

export default function NewProjectModal({ isOpen, onClose, onProjectCreated }: NewProjectModalProps) {
  const { tenantId } = useAuth();
  const [step, setStep] = useState<'files' | 'prompt'>('files');
  const [projectName, setProjectName] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [userPrompt, setUserPrompt] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelectionChange = (files: string[]) => {
    setSelectedFiles(files);
  };

  const handleOrderChange = (newOrder: string[]) => {
    setSelectedFiles(newOrder);
  };

  const handleRemoveFile = (fileId: string) => {
    setSelectedFiles(selectedFiles.filter(id => id !== fileId));
  };

  const handleNextStep = () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }
    setError(null);
    setStep('prompt');
  };

  const handleBackStep = () => {
    setStep('files');
    setError(null);
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      setError('Please enter a project name');
      return;
    }
    if (selectedFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const request: CreateProjectRequest = {
        name: projectName.trim(),
        userPrompt: userPrompt.trim() || 'Create a professional video tutorial.',
        selectedFiles,
      };

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId || '',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create project');
      }

      const data = await response.json();
      onProjectCreated(data.projectId);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setStep('files');
    setProjectName('');
    setSelectedFiles([]);
    setUserPrompt('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" 
          onClick={handleClose}
        />
        
        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Create New Project</h2>
              <button
                onClick={handleClose}
                className="p-2 text-gray-400 hover:text-gray-500 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
                </svg>
              </button>
            </div>
            
            {/* Progress Steps */}
            <div className="flex items-center mt-4">
              <div className={`flex items-center ${step === 'files' ? 'text-blue-600' : 'text-gray-400'}`}>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${step === 'files' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}
                `}>1</span>
                <span className="ml-2 text-sm font-medium">Select Files</span>
              </div>
              <div className="flex-grow mx-4 h-0.5 bg-gray-200">
                <div className={`h-full transition-all ${step === 'prompt' ? 'w-full bg-blue-600' : 'w-0'}`}></div>
              </div>
              <div className={`flex items-center ${step === 'prompt' ? 'text-blue-600' : 'text-gray-400'}`}>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${step === 'prompt' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}
                `}>2</span>
                <span className="ml-2 text-sm font-medium">Add Prompt</span>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                {error}
              </div>
            )}

            {step === 'files' && (
              <div className="space-y-6">
                {/* Project Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Project Name
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g., User Onboarding Tutorial"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* File Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Files from Library
                  </label>
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 max-h-64 overflow-y-auto">
                    <FileLibrary
                      selectedFiles={selectedFiles}
                      onSelectionChange={handleFileSelectionChange}
                      mode="select"
                    />
                  </div>
                </div>

                {/* Selected Files Order */}
                {selectedFiles.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      File Order ({selectedFiles.length} selected)
                    </label>
                    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <SelectedFilesList
                        selectedFileIds={selectedFiles}
                        onOrderChange={handleOrderChange}
                        onRemove={handleRemoveFile}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'prompt' && (
              <div className="space-y-6">
                {/* Summary */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-800">Project: {projectName}</h3>
                  <p className="text-sm text-blue-600 mt-1">{selectedFiles.length} file(s) selected</p>
                </div>

                {/* User Prompt */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prompt / Director Instructions
                  </label>
                  <p className="text-sm text-gray-500 mb-3">
                    Tell the AI how to create your video. What should it focus on? What tone should it use?
                  </p>
                  <textarea
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    placeholder="e.g., Create a guide for new employees. Skip the basic login details, just show it quickly. Focus heavily on the 'User Creation' form validation errors. Keep the tone helpful and professional."
                    rows={6}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                  <div className="mt-2 text-xs text-gray-500">
                    <strong>Tips:</strong>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>Use "focus on" to emphasize certain sections</li>
                      <li>Use "skip" or "fast" to minimize sections</li>
                      <li>Specify the tone: professional, casual, friendly, etc.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between">
            {step === 'files' ? (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleNextStep}
                  disabled={selectedFiles.length === 0 || !projectName.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next: Add Prompt
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleBackStep}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleCreateProject}
                  disabled={isCreating}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z" />
                      </svg>
                      Draft Script
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
