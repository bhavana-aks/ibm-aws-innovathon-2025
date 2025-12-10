// 10-12-25: Created wizard step configuration for auto-advancing project creation flow

export type WizardStepId = 
  | 'files'
  | 'prompt'
  | 'generating-script'
  | 'review'
  | 'generating-audio'
  | 'syncing'
  | 'recording'
  | 'complete';

export type StepStatus = 'pending' | 'active' | 'processing' | 'completed' | 'error';

export interface WizardStep {
  id: WizardStepId;
  label: string;
  shortLabel: string;
  requiresInput: boolean;
  description: string;
}

export const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'files',
    label: 'Select Files',
    shortLabel: 'Files',
    requiresInput: true,
    description: 'Choose files from your library',
  },
  {
    id: 'prompt',
    label: 'Add Prompt',
    shortLabel: 'Prompt',
    requiresInput: true,
    description: 'Describe how to create your video',
  },
  {
    id: 'generating-script',
    label: 'Generating Script',
    shortLabel: 'Script',
    requiresInput: false,
    description: 'AI is creating your script...',
  },
  {
    id: 'review',
    label: 'Review & Approve',
    shortLabel: 'Review',
    requiresInput: true,
    description: 'Edit script, select voice, and approve',
  },
  {
    id: 'generating-audio',
    label: 'Generating Audio',
    shortLabel: 'Audio',
    requiresInput: false,
    description: 'Creating narration audio files...',
  },
  {
    id: 'syncing',
    label: 'Syncing Script',
    shortLabel: 'Sync',
    requiresInput: false,
    description: 'Synchronizing audio with script...',
  },
  {
    id: 'recording',
    label: 'Recording Video',
    shortLabel: 'Record',
    requiresInput: false,
    description: 'Recording your video tutorial...',
  },
  {
    id: 'complete',
    label: 'Complete',
    shortLabel: 'Done',
    requiresInput: false,
    description: 'Your video is ready!',
  },
];

// Map project status to wizard step
export function getStepFromProjectStatus(status: string): WizardStepId {
  switch (status) {
    case 'DRAFT':
      return 'files';
    case 'GENERATING':
      return 'generating-script';
    case 'REVIEW':
      return 'review';
    case 'APPROVED':
      return 'generating-audio';
    case 'AUDIO_GENERATING':
      return 'generating-audio';
    case 'AUDIO_COMPLETE':
      return 'syncing';
    case 'SYNCING':
      return 'syncing';
    case 'RENDERING':
      return 'recording';
    case 'VIDEO_GENERATING':
      return 'recording';
    case 'COMPLETE':
      return 'complete';
    case 'ERROR':
      return 'complete'; // Show error at the end
    default:
      return 'files';
  }
}

// Get step index
export function getStepIndex(stepId: WizardStepId): number {
  return WIZARD_STEPS.findIndex(s => s.id === stepId);
}

// Check if step is completed based on current step
export function isStepCompleted(stepId: WizardStepId, currentStepId: WizardStepId): boolean {
  return getStepIndex(stepId) < getStepIndex(currentStepId);
}

// Check if step is the current active step
export function isStepActive(stepId: WizardStepId, currentStepId: WizardStepId): boolean {
  return stepId === currentStepId;
}

