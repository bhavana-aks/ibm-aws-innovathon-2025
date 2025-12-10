// 10-12-25: Created unified project wizard with auto-advancing steps and progress bar
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import FileLibrary from './file-library';
import SelectedFilesList from './selected-files-list';
import WizardProgressBar from './wizard-progress-bar';
import { 
  WIZARD_STEPS, 
  WizardStepId, 
  getStepFromProjectStatus,
  getStepIndex,
} from '@/lib/wizard-steps';
import { Project, AudioStep } from '@/types/project';

// Voice options for Amazon Polly
const VOICE_OPTIONS = [
  { id: 'matthew', name: 'Matthew (Male, US)', gender: 'male' },
  { id: 'joanna', name: 'Joanna (Female, US)', gender: 'female' },
  { id: 'brian', name: 'Brian (Male, UK)', gender: 'male' },
  { id: 'amy', name: 'Amy (Female, UK)', gender: 'female' },
  { id: 'ivy', name: 'Ivy (Female, US Child)', gender: 'female' },
  { id: 'joey', name: 'Joey (Male, US)', gender: 'male' },
];

interface ProjectWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (projectId: string) => void;
  existingProjectId?: string | null;
}

export default function ProjectWizard({ 
  isOpen, 
  onClose, 
  onComplete,
  existingProjectId 
}: ProjectWizardProps) {
  const { tenantId } = useAuth();
  
  // Form state
  const [projectName, setProjectName] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [userPrompt, setUserPrompt] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('matthew');
  
  // Project state
  const [projectId, setProjectId] = useState<string | null>(existingProjectId || null);
  const [project, setProject] = useState<Project | null>(null);
  const [manifest, setManifest] = useState<AudioStep[]>([]);
  
  // UI state
  const [currentStep, setCurrentStep] = useState<WizardStepId>('files');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Load existing project if provided
  useEffect(() => {
    if (existingProjectId && isOpen) {
      setProjectId(existingProjectId);
      fetchProject(existingProjectId);
    }
  }, [existingProjectId, isOpen]);

  // Poll for updates during processing steps
  useEffect(() => {
    if (!projectId || !isOpen) return;
    
    const processingSteps: WizardStepId[] = ['generating-script', 'generating-audio', 'syncing', 'recording'];
    
    if (!processingSteps.includes(currentStep)) return;

    const pollInterval = setInterval(() => {
      fetchProject(projectId);
      // Also poll video status endpoint during recording - this is what detects completion
      if (currentStep === 'recording') {
        pollVideoStatus(projectId);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [projectId, currentStep, isOpen]);

  // Poll video status endpoint - this checks S3 and updates project status
  const pollVideoStatus = async (id: string) => {
    try {
      const response = await fetch(`/api/projects/${id}/video`, {
        headers: { 'x-tenant-id': tenantId || '' },
      });
      
      if (response.ok) {
        const data = await response.json();
        // If status changed to COMPLETE or ERROR, refresh project
        if (data.status === 'COMPLETE' || data.status === 'ERROR') {
          fetchProject(id);
          if (data.videoUrl) {
            setVideoUrl(data.videoUrl);
          }
        }
      }
    } catch (err) {
      console.error('Error polling video status:', err);
    }
  };

  // Track which auto-triggers have been fired to prevent loops
  const [autoTriggered, setAutoTriggered] = useState<Record<string, boolean>>({});

  // Update current step based on project status
  useEffect(() => {
    if (project) {
      const newStep = getStepFromProjectStatus(project.status);
      setCurrentStep(newStep);
      
      if (project.manifest) {
        setManifest(project.manifest);
      }

      // Auto-trigger next steps - only once per status
      const triggerKey = `${project.id}-${project.status}`;
      
      if (!autoTriggered[triggerKey] && !isProcessing) {
        // Auto-trigger audio generation after approval
        if (project.status === 'APPROVED') {
          setAutoTriggered(prev => ({ ...prev, [triggerKey]: true }));
          handleGenerateAudio();
        }
        
        // Auto-trigger sync after audio complete
        if (project.status === 'AUDIO_COMPLETE') {
          setAutoTriggered(prev => ({ ...prev, [triggerKey]: true }));
          handleSyncScript();
        }
        
        // Auto-trigger video after sync
        if (project.status === 'RENDERING') {
          setAutoTriggered(prev => ({ ...prev, [triggerKey]: true }));
          handleGenerateVideo();
        }
      }
    }
  }, [project?.status, project?.id, isProcessing, autoTriggered]);

  const fetchProject = async (id: string) => {
    try {
      const response = await fetch(`/api/projects/${id}`, {
        headers: { 'x-tenant-id': tenantId || '' },
      });
      
      if (!response.ok) throw new Error('Failed to fetch project');
      
      const data = await response.json();
      setProject(data.project);
      
      // Fetch video URL if complete
      if (data.project.status === 'COMPLETE') {
        fetchVideoUrl(id);
      }
    } catch (err) {
      console.error('Error fetching project:', err);
    }
  };

  const fetchVideoUrl = async (id: string) => {
    try {
      const response = await fetch(`/api/projects/${id}/video`, {
        headers: { 'x-tenant-id': tenantId || '' },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.videoUrl) {
          setVideoUrl(data.videoUrl);
        }
      }
    } catch (err) {
      console.error('Error fetching video URL:', err);
    }
  };

  const handleFileSelectionChange = (files: string[]) => {
    setSelectedFiles(files);
  };

  const handleOrderChange = (newOrder: string[]) => {
    setSelectedFiles(newOrder);
  };

  const handleRemoveFile = (fileId: string) => {
    setSelectedFiles(selectedFiles.filter(id => id !== fileId));
  };

  const handleNextFromFiles = () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }
    if (!projectName.trim()) {
      setError('Please enter a project name');
      return;
    }
    setError(null);
    setCurrentStep('prompt');
  };

  const handleBackToFiles = () => {
    setCurrentStep('files');
    setError(null);
  };

  const handleCreateProject = async () => {
    if (!userPrompt.trim()) {
      // Use default prompt if empty
      setUserPrompt('Create a professional video tutorial.');
    }

    setIsProcessing(true);
    setError(null);
    setCurrentStep('generating-script');

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId || '',
        },
        body: JSON.stringify({
          name: projectName.trim(),
          userPrompt: userPrompt.trim() || 'Create a professional video tutorial.',
          selectedFiles,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create project');
      }

      const data = await response.json();
      setProjectId(data.projectId);
      
      // Start polling for project updates
      await fetchProject(data.projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setCurrentStep('prompt');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNarrationChange = (stepId: number, newNarration: string) => {
    setManifest(manifest.map(step => 
      step.step_id === stepId ? { ...step, narration: newNarration } : step
    ));
  };

  const handleApproveAndGenerate = async () => {
    if (!projectId) return;
    
    setIsProcessing(true);
    setError(null);

    try {
      // First approve the script
      const approveResponse = await fetch(`/api/projects/${projectId}/approve`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId || '',
        },
        body: JSON.stringify({ manifest }),
      });

      if (!approveResponse.ok) {
        throw new Error('Failed to approve script');
      }

      // Fetch updated project - this will trigger auto-chain
      await fetchProject(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve script');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateAudio = useCallback(async () => {
    if (!projectId || isProcessing) return;
    
    setIsProcessing(true);
    setCurrentStep('generating-audio');

    try {
      const response = await fetch(`/api/projects/${projectId}/audio`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId || '',
        },
        body: JSON.stringify({ voiceId: selectedVoice }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate audio');
      }

      await fetchProject(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate audio');
    } finally {
      setIsProcessing(false);
    }
  }, [projectId, selectedVoice, tenantId, isProcessing]);

  const handleSyncScript = useCallback(async () => {
    if (!projectId || isProcessing) return;
    
    setIsProcessing(true);
    setCurrentStep('syncing');

    try {
      const response = await fetch(`/api/projects/${projectId}/sync`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId || '',
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to sync script');
      }

      await fetchProject(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync script');
    } finally {
      setIsProcessing(false);
    }
  }, [projectId, tenantId, isProcessing]);

  const handleGenerateVideo = useCallback(async () => {
    if (!projectId || isProcessing) return;
    
    setIsProcessing(true);
    setCurrentStep('recording');

    try {
      const response = await fetch(`/api/projects/${projectId}/video`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId || '',
        },
        body: JSON.stringify({ useSimpleRecording: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start video generation');
      }

      await fetchProject(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate video');
    } finally {
      setIsProcessing(false);
    }
  }, [projectId, tenantId, isProcessing]);

  const handleClose = () => {
    // Reset state
    setProjectName('');
    setSelectedFiles([]);
    setUserPrompt('');
    setSelectedVoice('matthew');
    setProjectId(null);
    setProject(null);
    setManifest([]);
    setCurrentStep('files');
    setError(null);
    setIsProcessing(false);
    setEditingStep(null);
    setVideoUrl(null);
    setAutoTriggered({});
    onClose();
  };

  const handleFinish = () => {
    if (projectId) {
      onComplete(projectId);
    }
    handleClose();
  };

  const getImportanceColor = (importance: string) => {
    switch (importance) {
      case 'high': return 'border-red-400 bg-red-50';
      case 'medium': return 'border-yellow-400 bg-yellow-50';
      case 'low': return 'border-green-400 bg-green-50';
      default: return 'border-gray-300 bg-white';
    }
  };

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getTotalDuration = (): number => {
    if (!project?.durationMap) return 0;
    return Object.values(project.durationMap).reduce((sum, dur) => sum + dur, 0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="px-8 py-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 shrink-0">
        <div className="max-w-screen-2xl mx-auto w-full">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {projectId ? project?.name || 'Loading...' : 'Create New Project'}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {WIZARD_STEPS.find(s => s.id === currentStep)?.description}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-full transition-all"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
              </svg>
            </button>
          </div>
          
          {/* Progress Bar */}
          <WizardProgressBar 
            steps={WIZARD_STEPS} 
            currentStepId={currentStep}
            error={error}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50/30">
        <div className="max-w-screen-2xl mx-auto w-full p-8">
          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

            {/* Step: Files */}
            {currentStep === 'files' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Project Name
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g., User Onboarding Tutorial"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Select Files from Library
                  </label>
                  <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 max-h-64 overflow-y-auto">
                    <FileLibrary
                      selectedFiles={selectedFiles}
                      onSelectionChange={handleFileSelectionChange}
                      mode="select"
                    />
                  </div>
                </div>

                {selectedFiles.length > 0 && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      File Order ({selectedFiles.length} selected)
                    </label>
                    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
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

            {/* Step: Prompt */}
            {currentStep === 'prompt' && (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <h3 className="font-semibold text-blue-900">Project: {projectName}</h3>
                  <p className="text-sm text-blue-700 mt-1">{selectedFiles.length} file(s) selected</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Prompt / Director Instructions
                  </label>
                  <p className="text-sm text-gray-500 mb-3">
                    Tell the AI how to create your video. What should it focus on? What tone should it use?
                  </p>
                  <textarea
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    placeholder="e.g., Create a guide for new employees. Focus on the User Creation form validation. Keep the tone professional."
                    rows={6}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-all"
                  />
                </div>
              </div>
            )}

            {/* Step: Generating Script */}
            {currentStep === 'generating-script' && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M13.5,16V18H10.5V16H13.5M13.5,14H10.5V9H13.5V14M13,9H11V8H13V9Z" />
                    </svg>
                  </div>
                </div>
                <h3 className="mt-6 text-xl font-semibold text-gray-900">Generating Script</h3>
                <p className="mt-2 text-gray-600">AI is analyzing your files and creating a narrated script...</p>
                <p className="mt-1 text-sm text-gray-500">This may take a minute or two</p>
              </div>
            )}

            {/* Step: Review */}
            {currentStep === 'review' && manifest.length > 0 && (
              <div className="space-y-6">
                {/* Voice Selection */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-indigo-900">Select Narrator Voice</h3>
                      <p className="text-sm text-indigo-700 mt-1">Choose a voice for your video narration</p>
                    </div>
                    <select
                      value={selectedVoice}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="px-4 py-2 border border-indigo-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      {VOICE_OPTIONS.map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Script Steps */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Script Steps ({manifest.length})</h3>
                  <p className="text-sm text-gray-500">Click on any narration to edit it before generating</p>
                  
                  {manifest.map((step, index) => (
                    <div
                      key={step.step_id}
                      className={`border-l-4 rounded-xl shadow-sm overflow-hidden ${getImportanceColor(step.importance)}`}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="w-8 h-8 bg-gray-800 text-white rounded-full flex items-center justify-center text-sm font-medium">
                              {index + 1}
                            </span>
                            <div>
                              <span className="text-xs font-medium text-gray-500 uppercase">Step {step.step_id}</span>
                              <p className="text-sm font-mono text-gray-700 mt-0.5 max-w-xl truncate">{step.code_action}</p>
                            </div>
                          </div>
                        </div>

                        {editingStep === step.step_id ? (
                          <div className="mt-3">
                            <textarea
                              value={step.narration}
                              onChange={(e) => handleNarrationChange(step.step_id, e.target.value)}
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                              autoFocus
                            />
                            <div className="flex justify-end mt-2">
                              <button
                                onClick={() => setEditingStep(null)}
                                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div 
                            className="mt-3 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-blue-400 transition-colors"
                            onClick={() => setEditingStep(step.step_id)}
                          >
                            <p className="text-gray-700">{step.narration}</p>
                            <p className="text-xs text-gray-400 mt-2">Click to edit</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step: Generating Audio */}
            {currentStep === 'generating-audio' && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-8 h-8 text-indigo-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12,3V12.26C11.5,12.09 11,12 10.5,12C8,12 6,14 6,16.5C6,19 8,21 10.5,21C13,21 15,19 15,16.5V6H19V3H12Z" />
                    </svg>
                  </div>
                </div>
                <h3 className="mt-6 text-xl font-semibold text-gray-900">Generating Audio</h3>
                <p className="mt-2 text-gray-600">Creating narration audio files...</p>
                {project?.audioProgress && (
                  <div className="mt-4 w-64">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Progress</span>
                      <span>{project.audioProgress.completed} / {project.audioProgress.total}</span>
                    </div>
                    <div className="w-full bg-indigo-200 rounded-full h-2">
                      <div 
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${(project.audioProgress.completed / project.audioProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step: Syncing */}
            {currentStep === 'syncing' && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-8 h-8 text-orange-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z" />
                    </svg>
                  </div>
                </div>
                <h3 className="mt-6 text-xl font-semibold text-gray-900">Syncing Script</h3>
                <p className="mt-2 text-gray-600">Synchronizing audio timings with script...</p>
              </div>
            )}

            {/* Step: Recording */}
            {currentStep === 'recording' && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-8 h-8 text-pink-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z" />
                    </svg>
                  </div>
                </div>
                <h3 className="mt-6 text-xl font-semibold text-gray-900">Recording Video</h3>
                <p className="mt-2 text-gray-600">
                  {project?.videoProgress?.stage === 'STARTING' && 'Initializing recording environment...'}
                  {project?.videoProgress?.stage === 'RUNNING' && 'Recording browser session...'}
                  {project?.videoProgress?.stage === 'PROCESSING' && 'Processing video file...'}
                  {project?.videoProgress?.stage === 'UPLOADING' && 'Uploading video...'}
                  {!project?.videoProgress?.stage && 'This may take a few minutes...'}
                </p>
                {project?.videoProgress?.mock && (
                  <p className="mt-2 text-xs text-pink-500">(Demo mode)</p>
                )}
              </div>
            )}

            {/* Step: Complete */}
            {currentStep === 'complete' && (
              <div className="space-y-6">
                {project?.status === 'ERROR' ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
                      </svg>
                    </div>
                    <h3 className="mt-4 text-xl font-semibold text-gray-900">Something went wrong</h3>
                    <p className="mt-2 text-gray-600">{project?.errorMessage || 'An error occurred during video generation'}</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col items-center justify-center py-8">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z" />
                        </svg>
                      </div>
                      <h3 className="mt-4 text-xl font-semibold text-gray-900">Video Ready!</h3>
                      <p className="mt-2 text-gray-600">Your video tutorial has been generated successfully</p>
                    </div>

                    {/* Video Player */}
                    <div className="bg-gray-900 rounded-xl overflow-hidden">
                      <div className="aspect-video relative">
                        {videoUrl ? (
                          <video
                            src={videoUrl}
                            controls
                            className="w-full h-full"
                          >
                            Your browser does not support video playback.
                          </video>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                            <svg className="w-16 h-16 text-gray-400 mb-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z" />
                            </svg>
                            <p className="text-gray-400">Video generated</p>
                            <button
                              onClick={() => projectId && fetchVideoUrl(projectId)}
                              className="mt-4 px-4 py-2 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium"
                            >
                              Load Video
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Video Stats */}
                    <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-around">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-900">{manifest.length}</p>
                        <p className="text-sm text-gray-500">Steps</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-900">{formatDuration(getTotalDuration())}</p>
                        <p className="text-sm text-gray-500">Duration</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
      </div>

      {/* Footer */}
      <div className="px-8 py-5 border-t border-gray-100 bg-white shrink-0">
        <div className="max-w-screen-2xl mx-auto w-full flex justify-between">
          {currentStep === 'files' && (
              <>
                <button
                  onClick={handleClose}
                  className="px-5 py-2.5 text-gray-600 hover:text-gray-900 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleNextFromFiles}
                  disabled={selectedFiles.length === 0 || !projectName.trim()}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-sm"
                >
                  Next: Add Prompt
                </button>
              </>
            )}

            {currentStep === 'prompt' && (
              <>
                <button
                  onClick={handleBackToFiles}
                  className="px-5 py-2.5 text-gray-600 hover:text-gray-900 transition-colors font-medium"
                >
                  Back
                </button>
                <button
                  onClick={handleCreateProject}
                  disabled={isProcessing}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-sm flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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

            {currentStep === 'review' && (
              <>
                <button
                  onClick={handleClose}
                  className="px-5 py-2.5 text-gray-600 hover:text-gray-900 transition-colors font-medium"
                >
                  Save & Exit
                </button>
                <button
                  onClick={handleApproveAndGenerate}
                  disabled={isProcessing || manifest.length === 0}
                  className="px-6 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-sm flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
                      </svg>
                      Approve & Generate Video
                    </>
                  )}
                </button>
              </>
            )}

            {['generating-script', 'generating-audio', 'syncing', 'recording'].includes(currentStep) && (
              <div className="w-full flex justify-center">
                <p className="text-sm text-gray-500">Please wait while we process your video...</p>
              </div>
            )}

            {currentStep === 'complete' && (
              <>
                <div />
                <button
                  onClick={handleFinish}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium shadow-sm"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      </div>
  );
}

