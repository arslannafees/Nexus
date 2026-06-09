import React, { useEffect, useState } from 'react';
import { Upload, Folder, ChevronDown, Database } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Document } from '../../types';
import { DocumentCard } from '../../components/documents/DocumentCard';
import { UploadModal } from '../../components/documents/UploadModal';
import { DocumentPreviewModal } from '../../components/documents/DocumentPreviewModal';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

export const DocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [selectedPreviewDoc, setSelectedPreviewDoc] = useState<Document | null>(null);
  
  // Filter/Sort state
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('date-desc');

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await api.get('/documents');
      setDocuments(response.data.documents || []);
    } catch {
      toast.error('Failed to fetch documents');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      await api.delete(`/documents/${id}`);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      toast.success('Document deleted');
    } catch {
      toast.error('Failed to delete document');
    }
  };

  const handleToggleShare = async (doc: Document) => {
    try {
      const response = await api.patch(`/documents/${doc.id}`, {
        shared: !doc.shared,
      });
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? response.data.document : d))
      );
      // Update selected doc in preview modal if it is open
      if (selectedPreviewDoc?.id === doc.id) {
        setSelectedPreviewDoc(response.data.document);
      }
      toast.success(doc.shared ? 'Document is now private' : 'Document is now shared');
    } catch {
      toast.error('Failed to update share settings');
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const response = await api.get(`/documents/${doc.id}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      toast.error('Failed to download document');
    }
  };

  // Calculate storage stats from actual documents
  const parseSize = (sizeStr: string): number => {
    const value = parseFloat(sizeStr);
    if (isNaN(value)) return 0;
    if (sizeStr.includes('MB')) return value * 1024 * 1024;
    if (sizeStr.includes('KB')) return value * 1024;
    return value; // bytes
  };

  const totalUsedBytes = documents.reduce((acc, doc) => acc + parseSize(doc.size), 0);
  const totalLimitBytes = 50 * 1024 * 1024; // 50MB simulated user limit for standard level
  const percentUsed = Math.min((totalUsedBytes / totalLimitBytes) * 100, 100);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Filter & Sort documents
  const filteredDocuments = documents.filter((doc) => {
    if (filterType === 'all') return doc.status !== 'archived';
    if (filterType === 'shared') return doc.shared && doc.status !== 'archived';
    if (filterType === 'pdf') return doc.type === 'PDF' && doc.status !== 'archived';
    if (filterType === 'spreadsheet') return doc.type === 'Spreadsheet' && doc.status !== 'archived';
    if (filterType === 'signature') return doc.status === 'pending_signature';
    if (filterType === 'archived') return doc.status === 'archived';
    return true;
  });

  const sortedDocuments = [...filteredDocuments].sort((a, b) => {
    if (sortBy === 'date-desc') {
      return new Date(b.createdAt || b.lastModified).getTime() - new Date(a.createdAt || a.lastModified).getTime();
    }
    if (sortBy === 'date-asc') {
      return new Date(a.createdAt || a.lastModified).getTime() - new Date(b.createdAt || b.lastModified).getTime();
    }
    if (sortBy === 'name-asc') {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'name-desc') {
      return b.name.localeCompare(a.name);
    }
    return 0;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-150 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-1">
            Store, view, sign, and share your startup's crucial assets securely
          </p>
        </div>
        
        <Button leftIcon={<Upload size={18} />} onClick={() => setIsUploadOpen(true)}>
          Upload Document
        </Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Sidebar Info & Filters */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Storage stats */}
          <Card>
            <CardHeader className="pb-3 flex items-center gap-2">
              <Database className="text-primary-600" size={18} />
              <h2 className="text-sm font-bold text-gray-900">Storage Usage</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold text-gray-700">
                  <span>Used</span>
                  <span>{formatBytes(totalUsedBytes)} of {formatBytes(totalLimitBytes)}</span>
                </div>
                <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary-600 rounded-full transition-all duration-500" 
                    style={{ width: `${percentUsed}%` }}
                  ></div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Quick Filters */}
          <Card>
            <CardHeader className="pb-2">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Quick Filters</h2>
            </CardHeader>
            <CardBody className="p-2 space-y-1">
              {[
                { id: 'all', label: 'All Documents' },
                { id: 'shared', label: 'Shared with Me/Others' },
                { id: 'pdf', label: 'PDF Files' },
                { id: 'spreadsheet', label: 'Spreadsheets' },
                { id: 'signature', label: 'Pending Signature' },
                { id: 'archived', label: 'Archived' },
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setFilterType(filter.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
                    filterType === filter.id
                      ? 'bg-primary-50 text-primary-700 shadow-sm'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </CardBody>
          </Card>
        </div>
        
        {/* Document list */}
        <div className="lg:col-span-3">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-4 border-b border-gray-100">
              <h2 className="text-md font-bold text-gray-900">
                {filterType === 'all' && 'All Documents'}
                {filterType === 'shared' && 'Shared Documents'}
                {filterType === 'pdf' && 'PDF Files'}
                {filterType === 'spreadsheet' && 'Spreadsheets'}
                {filterType === 'signature' && 'Documents Pending Signature'}
                {filterType === 'archived' && 'Archived Documents'}
                <span className="text-xs font-medium text-gray-400 ml-2">({sortedDocuments.length})</span>
              </h2>
              
              <div className="flex items-center gap-2">
                <div className="relative inline-block text-left">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="appearance-none bg-white border border-gray-300 text-gray-700 py-1.5 pl-3 pr-8 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
                  >
                    <option value="date-desc">Newest First</option>
                    <option value="date-asc">Oldest First</option>
                    <option value="name-asc">Name A-Z</option>
                    <option value="name-desc">Name Z-A</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-2 text-gray-400 pointer-events-none" size={14} />
                </div>
              </div>
            </CardHeader>
            <CardBody className="flex-1 p-6">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-20 bg-gray-100 rounded-xl animate-pulse"></div>
                  ))}
                </div>
              ) : sortedDocuments.length === 0 ? (
                <div className="text-center py-16">
                  <div className="p-4 bg-gray-50 rounded-full w-fit mx-auto text-gray-400 mb-4 border border-gray-100">
                    <Folder size={40} />
                  </div>
                  <h3 className="text-md font-bold text-gray-900">No documents found</h3>
                  <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                    {filterType === 'all' 
                      ? "You haven't uploaded any documents yet. Get started by uploading your first file."
                      : "No files match the active filter criteria."}
                  </p>
                  {filterType === 'all' && (
                    <div className="mt-4">
                      <Button leftIcon={<Upload size={16} />} onClick={() => setIsUploadOpen(true)}>
                        Upload Document
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedDocuments.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      onPreview={(d) => setSelectedPreviewDoc(d)}
                      onDelete={handleDelete}
                      onToggleShare={handleToggleShare}
                      onDownload={handleDownload}
                    />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={fetchDocuments}
      />

      <DocumentPreviewModal
        document={selectedPreviewDoc}
        isOpen={!!selectedPreviewDoc}
        onClose={() => setSelectedPreviewDoc(null)}
        onDownload={handleDownload}
        onUpdate={fetchDocuments}
      />
    </div>
  );
};
export default DocumentsPage;