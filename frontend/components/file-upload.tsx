// 15-01-25: Fixed S3 upload CORS and Content-Type header handling
// 15-01-25: Updated to use tenant_id from auth context
'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function FileUpload() {
  const { tenantId, isAuthenticated } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    if (!isAuthenticated || !tenantId) {
      setError('You must be logged in to upload files.');
      return;
    }

    setUploading(true);
    setError(null);
    
    try {
      // Step 1: Get presigned URL from API
      // Use 'application/octet-stream' as fallback if file.type is empty
      const fileType = file.type || 'application/octet-stream';
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: fileType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get upload URL');
      }

      const { uploadUrl, fileKey } = await response.json();

      if (!uploadUrl) {
        throw new Error('No upload URL received from server');
      }

      // Step 2: Upload file to S3
      // The Content-Type header MUST match what was used to generate the presigned URL
      const headers: HeadersInit = {
        'Content-Type': fileType,
      };

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text().catch(() => 'Unknown error');
        throw new Error(`Failed to upload file to S3: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`);
      }

      // Step 3: Save metadata to DynamoDB
      const metadataResponse = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileKey,
          fileType: file.type,
          tenantId: tenantId,
        }),
      });

      if (!metadataResponse.ok) {
        const errorData = await metadataResponse.json();
        throw new Error(errorData.error || 'Failed to save file metadata');
      }

      setUploadedFiles([...uploadedFiles, file.name]);
      setFile(null);
      
      // Reset file input
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
    } catch (error) {
      console.error('Upload failed:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Upload failed. Please try again.';
      setError(errorMessage);
      
      // Log additional details for debugging
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.error('Network error - possible CORS issue. Check S3 bucket CORS configuration.');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-gray-400 transition-colors">
        <input
          id="file-input"
          type="file"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          disabled={uploading}
        />
        {file && (
          <div className="mt-2 text-sm text-gray-600">
            Selected: <span className="font-medium">{file.name}</span> ({(file.size / 1024).toFixed(2)} KB)
          </div>
        )}
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {uploadedFiles.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold mb-2 text-green-800">Uploaded Files:</h3>
          <ul className="list-disc list-inside space-y-1">
            {uploadedFiles.map((name, idx) => (
              <li key={idx} className="text-green-700">{name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


