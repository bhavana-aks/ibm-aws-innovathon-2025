// 07-12-25: Fixed fetchProjects to pass tenantId header to API
// 07-12-25: Created projects list component for displaying user projects
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Project } from '@/types/project';

interface ProjectsListProps {
  onSelectProject: (projectId: string) => void;
  refreshTrigger?: number;
}

export default function ProjectsList({ onSelectProject, refreshTrigger }: ProjectsListProps) {
  const { tenantId, isAuthenticated } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && tenantId) {
      fetchProjects();
    }
  }, [isAuthenticated, tenantId, refreshTrigger]);

  const fetchProjects = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/projects', {
        headers: {
          'x-tenant-id': tenantId || '',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch projects');
      
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { color: string; text: string; icon: string }> = {
      'DRAFT': { color: 'bg-gray-100 text-gray-700', text: 'Draft', icon: 'M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z' },
      'GENERATING': { color: 'bg-blue-100 text-blue-700', text: 'Generating', icon: 'M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z' },
      'REVIEW': { color: 'bg-yellow-100 text-yellow-700', text: 'Review', icon: 'M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z' },
      'APPROVED': { color: 'bg-green-100 text-green-700', text: 'Approved', icon: 'M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z' },
      'RENDERING': { color: 'bg-purple-100 text-purple-700', text: 'Rendering', icon: 'M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z' },
      'COMPLETE': { color: 'bg-green-100 text-green-700', text: 'Complete', icon: 'M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z' },
      'ERROR': { color: 'bg-red-100 text-red-700', text: 'Error', icon: 'M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z' },
    };
    const badge = badges[status] || badges['DRAFT'];
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <path d={badge.icon} />
        </svg>
        {badge.text}
      </span>
    );
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

  if (projects.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-1">No projects yet</h3>
        <p className="text-gray-500">Create your first video project to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((project) => (
        <div
          key={project.id}
          onClick={() => onSelectProject(project.id)}
          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer"
        >
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-medium text-gray-900 truncate pr-2">{project.name}</h3>
            {getStatusBadge(project.status)}
          </div>
          
          <p className="text-sm text-gray-500 line-clamp-2 mb-3">
            {project.userPrompt || 'No description'}
          </p>
          
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{project.selectedFiles?.length || 0} files</span>
            <span>{new Date(project.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
