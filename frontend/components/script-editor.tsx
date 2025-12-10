// 07-12-25: Added Phase 5 video recording UI
// 07-12-25: Added Phase 4 audio generation and sync UI
// 07-12-25: Fixed to pass tenantId header in all API calls
// 07-12-25: Created script editor component for reviewing and editing generated scripts
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Project, AudioStep, VideoProgress } from '@/types/project';

interface ScriptEditorProps {
  projectId: string;
  onBack: () => void;
}

// Voice options for Amazon Polly
const VOICE_OPTIONS = [
  { id: 'matthew', name: 'Matthew (Male, US)', gender: 'male' },
  { id: 'joanna', name: 'Joanna (Female, US)', gender: 'female' },
  { id: 'brian', name: 'Brian (Male, UK)', gender: 'male' },
  { id: 'amy', name: 'Amy (Female, UK)', gender: 'female' },
  { id: 'ivy', name: 'Ivy (Female, US Child)', gender: 'female' },
  { id: 'joey', name: 'Joey (Male, US)', gender: 'male' },
];

export default function ScriptEditor({ projectId, onBack }: ScriptEditorProps) {
  const { tenantId } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [manifest, setManifest] = useState<AudioStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('matthew');
  const [error, setError] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchProject();
    // Poll for updates if generating or processing
    const pollInterval = setInterval(() => {
      if (project?.status === 'GENERATING' || 
          project?.status === 'AUDIO_GENERATING' || 
          project?.status === 'SYNCING' ||
          project?.status === 'VIDEO_GENERATING') {
        fetchProject();
        // Also poll video status
        if (project?.status === 'VIDEO_GENERATING') {
          fetchVideoStatus();
        }
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [projectId, project?.status]);

  const fetchProject = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        headers: {
          'x-tenant-id': tenantId || '',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch project');
      
      const data = await response.json();
      setProject(data.project);
      if (data.project.manifest) {
        setManifest(data.project.manifest);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNarrationChange = (stepId: number, newNarration: string) => {
    setManifest(manifest.map(step => 
      step.step_id === stepId ? { ...step, narration: newNarration } : step
    ));
  };

  const handleImportanceChange = (stepId: number, importance: 'low' | 'medium' | 'high') => {
    setManifest(manifest.map(step => 
      step.step_id === stepId ? { ...step, importance } : step
    ));
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId || '',
        },
        body: JSON.stringify({ manifest }),
      });

      if (!response.ok) throw new Error('Failed to save draft');
      
      await fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveAndRender = async () => {
    setIsApproving(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/approve`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId || '',
        },
        body: JSON.stringify({ manifest }),
      });

      if (!response.ok) throw new Error('Failed to approve script');
      
      await fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setIsApproving(false);
    }
  };

  const handleGenerateAudio = async () => {
    setIsGeneratingAudio(true);
    setError(null);

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
      
      await fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate audio');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleSyncScript = async () => {
    setIsSyncing(true);
    setError(null);

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
      
      await fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync script');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGenerateVideo = async () => {
    setIsGeneratingVideo(true);
    setError(null);

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
      
      await fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate video');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const fetchVideoStatus = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/video`, {
        headers: {
          'x-tenant-id': tenantId || '',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.videoUrl) {
          setVideoUrl(data.videoUrl);
        }
        if (data.status === 'COMPLETE' || data.status === 'ERROR') {
          // Refresh project to get updated status
          await fetchProject();
        }
      }
    } catch (err) {
      console.error('Error fetching video status:', err);
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

  const getImportanceColor = (importance: string) => {
    switch (importance) {
      case 'high': return 'border-red-400 bg-red-50';
      case 'medium': return 'border-yellow-400 bg-yellow-50';
      case 'low': return 'border-green-400 bg-green-50';
      default: return 'border-gray-300 bg-white';
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { color: string; text: string }> = {
      'DRAFT': { color: 'bg-gray-100 text-gray-700', text: 'Draft' },
      'GENERATING': { color: 'bg-blue-100 text-blue-700', text: 'Generating Script...' },
      'REVIEW': { color: 'bg-yellow-100 text-yellow-700', text: 'Ready for Review' },
      'APPROVED': { color: 'bg-green-100 text-green-700', text: 'Approved - Ready for Audio' },
      'AUDIO_GENERATING': { color: 'bg-indigo-100 text-indigo-700', text: 'Generating Audio...' },
      'AUDIO_COMPLETE': { color: 'bg-cyan-100 text-cyan-700', text: 'Audio Ready - Ready to Sync' },
      'SYNCING': { color: 'bg-orange-100 text-orange-700', text: 'Syncing Script...' },
      'RENDERING': { color: 'bg-purple-100 text-purple-700', text: 'Ready for Video Rendering' },
      'VIDEO_GENERATING': { color: 'bg-pink-100 text-pink-700', text: 'Recording Video...' },
      'COMPLETE': { color: 'bg-green-100 text-green-700', text: 'Complete' },
      'ERROR': { color: 'bg-red-100 text-red-700', text: 'Error' },
    };
    const badge = badges[status] || badges['DRAFT'];
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading project...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
        Project not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" />
            </svg>
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{project.name}</h2>
            <p className="text-sm text-gray-500 mt-1">{project.selectedFiles?.length || 0} files • Created {new Date(project.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        {getStatusBadge(project.status)}
      </div>

      {/* User Prompt */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Director Instructions</h3>
        <p className="text-gray-600">{project.userPrompt || 'No specific instructions provided.'}</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Project Error */}
      {project.status === 'ERROR' && project.errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          <strong>Error:</strong> {project.errorMessage}
        </div>
      )}

      {/* Generating State */}
      {project.status === 'GENERATING' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-blue-700 font-medium">Generating your script...</p>
          <p className="text-sm text-blue-600 mt-1">This may take a minute or two.</p>
        </div>
      )}

      {/* Audio Generating State */}
      {project.status === 'AUDIO_GENERATING' && project.audioProgress && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-8">
          <div className="flex items-center justify-center gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
            <div className="text-left">
              <p className="text-indigo-700 font-medium">Generating Audio...</p>
              <p className="text-sm text-indigo-600 mt-1">
                Step {project.audioProgress.completed} of {project.audioProgress.total}
              </p>
            </div>
          </div>
          <div className="mt-4 w-full bg-indigo-200 rounded-full h-2.5">
            <div 
              className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${(project.audioProgress.completed / project.audioProgress.total) * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Syncing State */}
      {project.status === 'SYNCING' && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-orange-700 font-medium">Synchronizing script with audio timings...</p>
          <p className="text-sm text-orange-600 mt-1">Creating your synced Playwright runner.</p>
        </div>
      )}

      {/* Audio Complete Summary */}
      {(project.status === 'AUDIO_COMPLETE' || project.status === 'RENDERING') && project.durationMap && (
        <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-cyan-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12,3V12.26C11.5,12.09 11,12 10.5,12C8,12 6,14 6,16.5C6,19 8,21 10.5,21C13,21 15,19 15,16.5V6H19V3H12Z" />
              </svg>
              <div>
                <p className="font-medium text-cyan-800">Audio Generated Successfully</p>
                <p className="text-sm text-cyan-600">
                  {manifest.length} audio files • Total duration: {formatDuration(getTotalDuration())}
                </p>
              </div>
            </div>
            {project.status === 'RENDERING' && (
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                Ready for Phase 5
              </span>
            )}
          </div>
        </div>
      )}

      {/* Script Cards */}
      {manifest.length > 0 && project.status !== 'GENERATING' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Script Steps ({manifest.length})</h3>
          
          {manifest.map((step, index) => (
            <div
              key={step.step_id}
              className={`border-l-4 rounded-lg shadow-sm overflow-hidden ${getImportanceColor(step.importance)}`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 bg-gray-800 text-white rounded-full flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </span>
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase">Step {step.step_id}</span>
                      <p className="text-sm font-mono text-gray-700 mt-0.5">{step.code_action}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {step.audioGenerated && step.durationMs && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-cyan-100 text-cyan-700 rounded text-xs font-medium">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12,3V12.26C11.5,12.09 11,12 10.5,12C8,12 6,14 6,16.5C6,19 8,21 10.5,21C13,21 15,19 15,16.5V6H19V3H12Z" />
                        </svg>
                        {formatDuration(step.durationMs)}
                      </span>
                    )}
                    <select
                      value={step.importance}
                      onChange={(e) => handleImportanceChange(step.step_id, e.target.value as 'low' | 'medium' | 'high')}
                      className="text-xs px-2 py-1 border border-gray-300 rounded bg-white"
                      disabled={project.status !== 'REVIEW'}
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                    </select>
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
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  <div 
                    className={`mt-3 p-3 bg-white rounded border border-gray-200 ${project.status === 'REVIEW' ? 'cursor-pointer hover:border-blue-400' : ''}`}
                    onClick={() => project.status === 'REVIEW' && setEditingStep(step.step_id)}
                  >
                    <p className="text-gray-700">{step.narration}</p>
                    {project.status === 'REVIEW' && (
                      <p className="text-xs text-gray-400 mt-2">Click to edit</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action Buttons - REVIEW Status */}
      {project.status === 'REVIEW' && manifest.length > 0 && (
        <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
          <button
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={handleApproveAndRender}
            disabled={isApproving}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isApproving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Approving...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z" />
                </svg>
                Approve & Render
              </>
            )}
          </button>
        </div>
      )}

      {/* Action Buttons - APPROVED Status: Generate Audio */}
      {project.status === 'APPROVED' && manifest.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-green-800">Script Approved</h3>
              <p className="text-sm text-green-600 mt-1">
                Your script is ready. Select a voice and generate audio narration.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-600 mb-1">Narrator Voice</label>
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  disabled={isGeneratingAudio}
                >
                  {VOICE_OPTIONS.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleGenerateAudio}
                disabled={isGeneratingAudio}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {isGeneratingAudio ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12,3V12.26C11.5,12.09 11,12 10.5,12C8,12 6,14 6,16.5C6,19 8,21 10.5,21C13,21 15,19 15,16.5V6H19V3H12Z" />
                    </svg>
                    Generate Audio
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons - AUDIO_COMPLETE Status: Sync Script */}
      {project.status === 'AUDIO_COMPLETE' && (
        <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-cyan-800">Audio Ready</h3>
              <p className="text-sm text-cyan-600 mt-1">
                All audio files generated. Sync the script to add timing delays.
              </p>
            </div>
            <button
              onClick={handleSyncScript}
              disabled={isSyncing}
              className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isSyncing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Syncing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z" />
                  </svg>
                  Sync Script with Audio
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Rendering Ready State - Start Video Generation */}
      {project.status === 'RENDERING' && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-purple-800">Ready for Video Recording</h3>
                <p className="text-sm text-purple-600 mt-1">
                  Script synchronized with audio timings. Click to generate your video.
                </p>
                {project.syncedScriptS3Key && (
                  <p className="text-xs text-purple-500 mt-2 font-mono">
                    Synced script: {project.syncedScriptS3Key}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleGenerateVideo}
              disabled={isGeneratingVideo}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center gap-2 font-medium"
            >
              {isGeneratingVideo ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Starting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
                  </svg>
                  Generate Video
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Video Generating State */}
      {project.status === 'VIDEO_GENERATING' && (
        <div className="bg-pink-50 border border-pink-200 rounded-lg p-8">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-pink-200 border-t-pink-600"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-8 h-8 text-pink-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z" />
                </svg>
              </div>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-pink-800">Recording Video...</h3>
            <p className="mt-2 text-sm text-pink-600">
              {project.videoProgress?.stage === 'STARTING' && 'Initializing recording environment...'}
              {project.videoProgress?.stage === 'RUNNING' && 'Recording browser session with audio...'}
              {project.videoProgress?.stage === 'PROCESSING' && 'Processing video file...'}
              {project.videoProgress?.stage === 'UPLOADING' && 'Uploading video to storage...'}
              {!project.videoProgress?.stage && 'This may take a few minutes. Please wait...'}
            </p>
            {project.videoProgress?.mock && (
              <p className="mt-2 text-xs text-pink-500">(Demo mode - simulating video generation)</p>
            )}
          </div>
        </div>
      )}

      {/* Video Complete State */}
      {project.status === 'COMPLETE' && (
        <div className="space-y-6">
          {/* Success Banner */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-green-800">Video Ready!</h3>
                <p className="text-sm text-green-600 mt-1">
                  Your video has been generated successfully.
                </p>
              </div>
            </div>
          </div>

          {/* Video Player */}
          <div className="bg-gray-900 rounded-lg overflow-hidden">
            <div className="aspect-video relative">
              {videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  className="w-full h-full"
                  poster=""
                >
                  Your browser does not support video playback.
                </video>
              ) : project.videoS3Key ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                  <svg className="w-16 h-16 text-gray-400 mb-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z" />
                  </svg>
                  <p className="text-gray-400">Video generated</p>
                  <p className="text-sm text-gray-500 mt-1 font-mono">{project.videoS3Key}</p>
                  <button
                    onClick={fetchVideoStatus}
                    className="mt-4 px-4 py-2 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium"
                  >
                    Load Video
                  </button>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                  <p>Video file not found</p>
                </div>
              )}
            </div>
          </div>

          {/* Video Info */}
          <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12,3V12.26C11.5,12.09 11,12 10.5,12C8,12 6,14 6,16.5C6,19 8,21 10.5,21C13,21 15,19 15,16.5V6H19V3H12Z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-700">Total Duration</p>
                <p className="text-xs text-gray-500">{formatDuration(getTotalDuration())}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,19H5V5H19V19Z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-700">Steps</p>
                <p className="text-xs text-gray-500">{manifest.length} scenes</p>
              </div>
            </div>
            {project.videoProgress?.completedAt && (
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-gray-700">Completed</p>
                  <p className="text-xs text-gray-500">{new Date(project.videoProgress.completedAt).toLocaleString()}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
