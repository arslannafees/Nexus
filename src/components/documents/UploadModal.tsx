import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { X, Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onUploadSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setStatus('idle');
      setUploadProgress(0);
      setErrorMessage('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024, // 20MB
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/msword': ['.doc'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
    },
    onDropRejected: (fileRejections) => {
      if (fileRejections.length > 0) {
        const error = fileRejections[0].errors[0];
        if (error.code === 'file-too-large') {
          toast.error('File exceeds the 20 MB size limit');
        } else {
          toast.error(error.message);
        }
      }
    }
  });

  const handleUpload = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setStatus('uploading');
    setUploadProgress(0);

    try {
      // Use the centralized API client which automatically attaches the correct token
      const response = await api.post('/documents', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || progressEvent.loaded)
          );
          setUploadProgress(percentCompleted);
        },
      });

      if (response.status === 201) {
        setStatus('success');
        toast.success('Document uploaded successfully');
        setTimeout(() => {
          onUploadSuccess();
          handleClose();
        }, 1500);
      }
    } catch (error) {
      setStatus('error');
      const err = error as { response?: { data?: { message?: string } } };
      const message = err.response?.data?.message || 'Failed to upload document';
      setErrorMessage(message);
      toast.error(message);
    }
  };

  const handleClose = () => {
    setFile(null);
    setUploadProgress(0);
    setStatus('idle');
    setErrorMessage('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Upload Document</h2>
          <button
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {status === 'idle' && (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${
                isDragActive
                  ? 'border-primary-500 bg-primary-50/50'
                  : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50/55'
              }`}
            >
              <input {...getInputProps()} />
              <div className="p-4 bg-primary-50 text-primary-600 rounded-full w-fit mx-auto mb-4">
                <Upload size={28} />
              </div>
              <p className="text-sm font-semibold text-gray-800">
                {isDragActive ? 'Drop your document here' : 'Drag & drop your document here'}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Supports PDF, Word, Excel, PowerPoint, Text, CSV, and Images (up to 20MB)
              </p>
              <div className="mt-4">
                <Button size="sm" type="button" variant="outline">
                  Browse Files
                </Button>
              </div>
            </div>
          )}

          {file && status !== 'success' && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-100 text-primary-700 rounded-lg">
                  <FileText size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                {status === 'idle' && (
                  <button
                    onClick={() => setFile(null)}
                    className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {status === 'uploading' && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-gray-700">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="animate-spin text-primary-600" size={14} />
                      Uploading...
                    </span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-primary-600 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {status === 'error' && (
                <div className="flex items-start gap-2 text-error-600 text-xs mt-2 bg-error-50 p-2.5 rounded-lg border border-error-100">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Upload failed:</span> {errorMessage}
                  </div>
                </div>
              )}
            </div>
          )}

          {status === 'success' && (
            <div className="text-center py-8 space-y-4">
              <div className="p-4 bg-success-50 text-success-600 rounded-full w-fit mx-auto animate-bounce">
                <CheckCircle size={40} />
              </div>
              <h3 className="text-md font-bold text-gray-900">Upload Complete</h3>
              <p className="text-sm text-gray-600">Your document has been processed and saved.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-150 flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={status === 'uploading'}
          >
            Cancel
          </Button>
          {status !== 'success' && file && (
            <Button
              onClick={handleUpload}
              disabled={status === 'uploading'}
              leftIcon={status === 'uploading' ? undefined : <Upload size={16} />}
            >
              {status === 'uploading' ? 'Uploading...' : 'Upload'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
