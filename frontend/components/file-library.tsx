// 07-12-25: Fixed fetchFiles to pass tenantId header to API
// 07-12-25: Created file library component for displaying and selecting files
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { FileItem } from '@/types/project';

interface FileLibraryProps {
  selectedFiles: string[];
  onSelectionChange: (files: string[]) => void;
  mode: 'view' | 'select';
}

export default function FileLibrary({ selectedFiles, onSelectionChange, mode }: FileLibraryProps) {
  const { tenantId, isAuthenticated } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && tenantId) {
      fetchFiles();
    }
  }, [isAuthenticated, tenantId]);

  const fetchFiles = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/files', {
        headers: {
          'x-tenant-id': tenantId || '',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }
      const data = await response.json();
      setFiles(data.files || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFileSelection = (fileId: string) => {
    if (mode !== 'select') return;
    
    if (selectedFiles.includes(fileId)) {
      onSelectionChange(selectedFiles.filter(id => id !== fileId));
    } else {
      onSelectionChange([...selectedFiles, fileId]);
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf':
        return (
          <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M14,18H10V17H14V18M14,15H10V11H14V15M13,9V3.5L18.5,9H13Z" />
          </svg>
        );
      case 'playwright':
        return (
          <svg className="w-8 h-8 text-green-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14.6,16.6L19.2,12L14.6,7.4L16,6L22,12L16,18L14.6,16.6M9.4,16.6L4.8,12L9.4,7.4L8,6L2,12L8,18L9.4,16.6Z" />
          </svg>
        );
      default:
        return (
          <svg className="w-8 h-8 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
          </svg>
        );
    }
  };

  const getFileType = (fileName: string): 'pdf' | 'playwright' | 'other' => {
    if (fileName.endsWith('.pdf')) return 'pdf';
    if (fileName.endsWith('.spec.ts') || fileName.endsWith('.test.ts') || fileName.endsWith('.spec.js') || fileName.endsWith('.test.js')) return 'playwright';
    return 'other';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
        {error}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No files in your library yet.</p>
        <p className="text-sm mt-1">Upload PDF guides or Playwright scripts to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {files.map((file) => {
        const fileType = getFileType(file.name);
        const isSelected = selectedFiles.includes(file.id);
        
        return (
          <div
            key={file.id}
            onClick={() => toggleFileSelection(file.id)}
            className={`
              p-4 rounded-lg border-2 transition-all
              ${mode === 'select' ? 'cursor-pointer hover:shadow-md' : ''}
              ${isSelected 
                ? 'border-blue-500 bg-blue-50 shadow-md' 
                : 'border-gray-200 bg-white hover:border-gray-300'
              }
            `}
          >
            <div className="flex flex-col items-center">
              <div className="relative">
                {getFileIcon(fileType)}
                {mode === 'select' && isSelected && (
                  <div className="absolute -top-1 -right-1 bg-blue-500 rounded-full p-1">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm font-medium text-gray-900 text-center truncate w-full" title={file.name}>
                {file.name}
              </p>
              <span className={`
                mt-1 text-xs px-2 py-0.5 rounded-full
                ${fileType === 'pdf' ? 'bg-red-100 text-red-700' : ''}
                ${fileType === 'playwright' ? 'bg-green-100 text-green-700' : ''}
                ${fileType === 'other' ? 'bg-gray-100 text-gray-700' : ''}
              `}>
                {fileType === 'pdf' ? 'PDF Guide' : fileType === 'playwright' ? 'Test Script' : 'Other'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
