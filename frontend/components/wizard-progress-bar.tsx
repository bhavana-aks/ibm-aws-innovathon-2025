// 10-12-25: Created horizontal progress bar component for wizard steps
'use client';

import { WizardStep, WizardStepId, getStepIndex, isStepCompleted, isStepActive } from '@/lib/wizard-steps';

interface WizardProgressBarProps {
  steps: WizardStep[];
  currentStepId: WizardStepId;
  error?: string | null;
}

export default function WizardProgressBar({ steps, currentStepId, error }: WizardProgressBarProps) {
  const currentIndex = getStepIndex(currentStepId);
  // Calculate percentage for the progress line
  const progressPercentage = Math.min(100, (currentIndex / (steps.length - 1)) * 100);

  return (
    <div className="w-full py-2">
      <div className="relative mx-2">
        {/* Background Track */}
        <div className="absolute top-5 left-0 right-0 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div className="absolute inset-0 bg-gray-100" />
        </div>
        
        {/* Active Gradient Progress Line */}
        <div 
          className="absolute top-5 left-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-600 rounded-full transition-all duration-700 ease-in-out shadow-[0_0_10px_rgba(99,102,241,0.4)]"
          style={{ 
            width: `${progressPercentage}%` 
          }}
        />

        {/* Steps Container */}
        <div className="relative flex justify-between">
          {steps.map((step, index) => {
            const isCompleted = isStepCompleted(step.id, currentStepId);
            const isActive = isStepActive(step.id, currentStepId);
            const isProcessing = isActive && !step.requiresInput && step.id !== 'complete';
            const hasError = error && isActive;
            const showAsCompleted = isCompleted || (isActive && step.id === 'complete' && !hasError);

            // Dynamic classes for step circle
            const circleClasses = `
              relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold 
              transition-all duration-500 border-2 
              ${hasError 
                ? 'bg-red-50 border-red-500 text-red-600 shadow-[0_0_15px_rgba(239,68,68,0.4)] scale-110' 
                : showAsCompleted 
                  ? 'bg-gradient-to-br from-blue-600 to-indigo-600 border-transparent text-white shadow-md scale-100' 
                  : isActive 
                    ? 'bg-white border-indigo-600 text-indigo-600 ring-4 ring-indigo-50 shadow-xl scale-110' 
                    : 'bg-white border-gray-200 text-gray-300'
              }
            `;

            // Dynamic classes for label
            const labelClasses = `
              mt-3 text-[10px] font-bold uppercase tracking-wider text-center transition-colors duration-300
              ${hasError 
                ? 'text-red-600' 
                : isActive 
                  ? 'text-indigo-700' 
                  : showAsCompleted 
                    ? 'text-indigo-900/70' 
                    : 'text-gray-400'
              }
            `;

            return (
              <div 
                key={step.id}
                className="flex flex-col items-center group cursor-default"
                style={{ width: `${100 / steps.length}%` }}
              >
                {/* Step Circle */}
                <div className={circleClasses}>
                  {/* Processing Spinner Ring */}
                  {isProcessing && !hasError && (
                    <div className="absolute inset-0 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
                  )}

                  {/* Icon Content */}
                  <div className="relative z-10 flex items-center justify-center">
                    {hasError ? (
                      <span className="text-lg">!</span>
                    ) : showAsCompleted ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </div>
                </div>

                {/* Step Label */}
                <div className="flex flex-col items-center min-h-[2rem]">
                  <span className={labelClasses}>
                    {step.shortLabel}
                  </span>
                  
                  {/* Processing Badge */}
                  {isProcessing && !hasError && (
                    <span className="mt-0.5 text-[9px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full animate-pulse">
                      Processing
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
