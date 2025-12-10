// 07-12-25: Created draggable selected files list for ordering
'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileItem } from '@/types/project';

interface SelectedFilesListProps {
  selectedFileIds: string[];
  onOrderChange: (newOrder: string[]) => void;
  onRemove: (fileId: string) => void;
}

export default function SelectedFilesList({ selectedFileIds, onOrderChange, onRemove }: SelectedFilesListProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchFileDetails();
  }, [selectedFileIds]);

  const fetchFileDetails = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/files');
      if (!response.ok) throw new Error('Failed to fetch files');
      const data = await response.json();
      
      // Filter and order files according to selectedFileIds
      const fileMap = new Map(data.files?.map((f: FileItem) => [f.id, f]) || []);
      const orderedFiles = selectedFileIds
        .map(id => fileMap.get(id))
        .filter((f): f is FileItem => f !== undefined);
      
      setFiles(orderedFiles);
    } catch (err) {
      console.error('Failed to fetch file details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', '');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedIndex === null || draggedIndex === index) return;

    const newFiles = [...files];
    const draggedFile = newFiles[draggedIndex];
    newFiles.splice(draggedIndex, 1);
    newFiles.splice(index, 0, draggedFile);

    setFiles(newFiles);
    setDraggedIndex(index);
  }, [draggedIndex, files]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    onOrderChange(files.map(f => f.id));
  }, [files, onOrderChange]);

  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.pdf')) {
      return (
        <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M14,18H10V17H14V18M14,15H10V11H14V15M13,9V3.5L18.5,9H13Z" />
        </svg>
      );
    }
    if (fileName.endsWith('.spec.ts') || fileName.endsWith('.test.ts') || fileName.endsWith('.spec.js') || fileName.endsWith('.test.js')) {
      return (
        <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14.6,16.6L19.2,12L14.6,7.4L16,6L22,12L16,18L14.6,16.6M9.4,16.6L4.8,12L9.4,7.4L8,6L2,12L8,18L9.4,16.6Z" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
      </svg>
    );
  };

  if (isLoading && selectedFileIds.length > 0) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        Select files from your library above
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 mb-2">Drag to reorder files:</p>
      {files.map((file, index) => (
        <div
          key={file.id}
          draggable
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragEnd={handleDragEnd}
          className={`
            flex items-center gap-3 p-3 bg-white border rounded-lg cursor-move
            transition-all hover:shadow-md
            ${draggedIndex === index ? 'opacity-50 border-blue-400 shadow-lg' : 'border-gray-200'}
          `}
        >
          <div className="flex-shrink-0 text-gray-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9,3H11V5H9V3M13,3H15V5H13V3M9,7H11V9H9V7M13,7H15V9H13V7M9,11H11V13H9V11M13,11H15V13H13V11M9,15H11V17H9V15M13,15H15V17H13V15M9,19H11V21H9V19M13,19H15V21H13V19Z" />
            </svg>
          </div>
          <div className="flex-shrink-0">
            {getFileIcon(file.name)}
          </div>
          <div className="flex-grow min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
            <p className="text-xs text-gray-500">Step {index + 1}</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(file.id);
            }}
            className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}




