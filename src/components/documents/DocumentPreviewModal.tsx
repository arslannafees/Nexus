import React, { useState, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Download, PenTool, Calendar, User, FileText, CheckCircle2 } from 'lucide-react';
import { Document as DocType, DocumentSignature } from '../../types';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { SignaturePad } from './SignaturePad';
import { api } from '../../lib/api';

// Setup react-pdf
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version || '4.4.168'}/build/pdf.worker.min.mjs`;

interface DocumentPreviewModalProps {
  document: DocType | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (doc: DocType) => void;
  onUpdate: () => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  document: doc,
  isOpen,
  onClose,
  onDownload,
  onUpdate,
}) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [signatures, setSignatures] = useState<DocumentSignature[]>([]);
  const [showSignPad, setShowSignPad] = useState<boolean>(false);
  const [loadingSignatures, setLoadingSignatures] = useState<boolean>(false);

  const fetchSignatures = useCallback(async () => {
    if (!doc) return;
    setLoadingSignatures(true);
    try {
      const response = await api.get(`/documents/${doc.id}/signatures`);
      setSignatures(response.data.signatures || []);
    } catch (error) {
      console.error('Failed to fetch signatures:', error);
    } finally {
      setLoadingSignatures(false);
    }
  }, [doc]);

  useEffect(() => {
    if (isOpen && doc) {
      fetchSignatures();
      setShowSignPad(false);
      setPageNumber(1);
      setScale(1.0);
    }
  }, [isOpen, doc, fetchSignatures]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.2, 2.0));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.6));

  const handlePrevPage = () => setPageNumber((prev) => Math.max(prev - 1, 1));
  const handleNextPage = () => setPageNumber((prev) => Math.min(prev + 1, numPages || 1));

  const handleSignatureSuccess = () => {
    fetchSignatures();
    setShowSignPad(false);
    onUpdate();
  };

  if (!isOpen || !doc) return null;

  const isPDF = doc.mimeType === 'application/pdf';
  const isImage = doc.mimeType.startsWith('image/');
  const fileUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:4000'}${doc.url}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-150 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-50 rounded-lg text-primary-600">
              <FileText size={22} />
            </div>
            <div>
              <h2 className="text-md font-bold text-gray-900 truncate max-w-md">{doc.name}</h2>
              <p className="text-xs text-gray-500">Version {doc.version} • {doc.size}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Workspace Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Main Viewer Area */}
          <div className="flex-1 bg-gray-100 flex flex-col overflow-auto p-4 justify-between items-center min-h-0 relative">
            {showSignPad ? (
              <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-md border border-gray-200 my-auto animate-scale-up">
                <h3 className="text-md font-bold text-gray-900 mb-2">Sign Document</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Provide your signature to authorize/approve this document.
                </p>
                <SignaturePad
                  documentId={doc.id}
                  onClose={() => setShowSignPad(false)}
                  onSignatureSuccess={handleSignatureSuccess}
                />
              </div>
            ) : (
              <>
                {/* PDF Viewer */}
                {isPDF ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0 overflow-auto w-full">
                    <div className="bg-white p-2 rounded-xl shadow-lg border border-gray-200 overflow-auto max-w-full max-h-full">
                      <Document
                        file={fileUrl}
                        onLoadSuccess={onDocumentLoadSuccess}
                        loading={
                          <div className="flex items-center justify-center p-12">
                            <span className="text-sm font-medium text-gray-500">Loading PDF...</span>
                          </div>
                        }
                        error={
                          <div className="flex items-center justify-center p-12 text-error-600">
                            <span className="text-sm font-medium">Failed to load PDF preview.</span>
                          </div>
                        }
                      >
                        <Page pageNumber={pageNumber} scale={scale} renderTextLayer={true} renderAnnotationLayer={true} />
                      </Document>
                    </div>
                  </div>
                ) : isImage ? (
                  <div className="flex-1 flex items-center justify-center p-4 min-h-0 overflow-auto w-full">
                    <img
                      src={fileUrl}
                      alt={doc.name}
                      style={{ transform: `scale(${scale})` }}
                      className="max-h-[60vh] object-contain rounded-lg shadow-lg border border-gray-200 bg-white transition-transform duration-200"
                    />
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center my-auto">
                    <div className="p-4 bg-gray-200/50 rounded-full text-gray-400 mb-4">
                      <FileText size={48} />
                    </div>
                    <h3 className="text-md font-bold text-gray-900">No Preview Available</h3>
                    <p className="text-xs text-gray-500 mt-1 max-w-sm">
                      We cannot preview {doc.type} files online. Please download the file to view its contents.
                    </p>
                    <div className="mt-4">
                      <Button
                        onClick={() => onDownload(doc)}
                        leftIcon={<Download size={16} />}
                      >
                        Download File
                      </Button>
                    </div>
                  </div>
                )}

                {/* Document Preview Controls */}
                {(isPDF || isImage) && (
                  <div className="flex items-center gap-4 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-full border border-gray-200 shadow-lg mt-4 sticky bottom-2 z-10">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="p-1.5" onClick={handleZoomOut}>
                        <ZoomOut size={16} />
                      </Button>
                      <span className="text-xs font-semibold w-12 text-center text-gray-700">
                        {Math.round(scale * 100)}%
                      </span>
                      <Button variant="ghost" size="sm" className="p-1.5" onClick={handleZoomIn}>
                        <ZoomIn size={16} />
                      </Button>
                    </div>

                    {isPDF && numPages && numPages > 1 && (
                      <>
                        <div className="w-px h-4 bg-gray-200"></div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-1.5"
                            onClick={handlePrevPage}
                            disabled={pageNumber <= 1}
                          >
                            <ChevronLeft size={16} />
                          </Button>
                          <span className="text-xs text-gray-700 font-semibold">
                            Page {pageNumber} of {numPages}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-1.5"
                            onClick={handleNextPage}
                            disabled={pageNumber >= numPages}
                          >
                            <ChevronRight size={16} />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right Info & Signature Sidebar */}
          <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-gray-150 flex flex-col bg-gray-50/50">
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              
              {/* Properties */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Properties</h3>
                <div className="space-y-3.5">
                  <div className="flex items-start gap-3 text-xs">
                    <User size={16} className="text-gray-400 mt-0.5" />
                    <div>
                      <p className="font-semibold text-gray-700">Owner</p>
                      <p className="text-gray-600">{doc.ownerName || 'Self'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 text-xs">
                    <Calendar size={16} className="text-gray-400 mt-0.5" />
                    <div>
                      <p className="font-semibold text-gray-700">Created At</p>
                      <p className="text-gray-600">
                        {new Date(doc.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 text-xs">
                    <FileText size={16} className="text-gray-400 mt-0.5" />
                    <div>
                      <p className="font-semibold text-gray-700">Type</p>
                      <p className="text-gray-600">{doc.mimeType}</p>
                    </div>
                  </div>
                </div>
              </div>

              <hr className="border-gray-200" />

              {/* Signatures List */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Signatures</h3>
                {loadingSignatures ? (
                  <p className="text-xs text-gray-500 italic">Loading signatures...</p>
                ) : signatures.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No signatures recorded yet.</p>
                ) : (
                  <div className="space-y-3">
                    {signatures.map((sig) => (
                      <div key={sig.id} className="p-3 bg-white border border-gray-150 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-800">{sig.signerName}</span>
                          <Badge variant="success" size="sm">
                            <span className="flex items-center gap-1">
                              <CheckCircle2 size={10} /> Signed
                            </span>
                          </Badge>
                        </div>
                        <div className="bg-gray-50/50 p-1 border border-gray-100 rounded-lg flex items-center justify-center h-12">
                          <img
                            src={`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}${sig.signatureUrl}`}
                            alt={`Signature by ${sig.signerName}`}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div className="text-[10px] text-gray-400 text-right">
                          {new Date(sig.signedAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions Sidebar */}
            <div className="p-4 border-t border-gray-150 bg-white space-y-2">
              <Button
                className="w-full justify-center"
                leftIcon={<Download size={16} />}
                onClick={() => onDownload(doc)}
                variant="outline"
              >
                Download File
              </Button>
              {doc.status === 'pending_signature' && !showSignPad && (
                <Button
                  className="w-full justify-center"
                  leftIcon={<PenTool size={16} />}
                  onClick={() => setShowSignPad(true)}
                >
                  Sign Document
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
