import { FileText, Download, Trash2, Share2, Eye } from 'lucide-react';
import { Document } from '../../types';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface DocumentCardProps {
  document: Document;
  onPreview: (doc: Document) => void;
  onDelete: (id: string) => void;
  onToggleShare: (doc: Document) => void;
  onDownload: (doc: Document) => void;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  document,
  onPreview,
  onDelete,
  onToggleShare,
  onDownload,
}) => {
  const getIcon = () => {
    switch (document.type) {
      case 'PDF':
        return <FileText className="text-red-500" size={24} />;
      case 'Spreadsheet':
        return <FileText className="text-green-500" size={24} />;
      case 'Presentation':
        return <FileText className="text-orange-500" size={24} />;
      case 'Document':
        return <FileText className="text-blue-500" size={24} />;
      case 'Image':
        return <FileText className="text-purple-500" size={24} />;
      default:
        return <FileText className="text-gray-500" size={24} />;
    }
  };

  const getStatusBadge = () => {
    switch (document.status) {
      case 'active':
        return <Badge variant="success">Active</Badge>;
      case 'archived':
        return <Badge variant="secondary">Archived</Badge>;
      case 'pending_signature':
        return <Badge variant="warning">Pending Signature</Badge>;
      default:
        return null;
    }
  };

  const formattedDate = new Date(document.lastModified || document.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center p-4 bg-white border border-gray-150 hover:border-primary-300 hover:shadow-md rounded-xl transition-all duration-300 gap-4"
    >
      <div 
        className="flex items-center gap-4 flex-1 cursor-pointer min-w-0"
        onClick={() => onPreview(document)}
      >
        <div className="p-3 bg-gray-50 rounded-xl flex-shrink-0">
          {getIcon()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-800 truncate hover:text-primary-600 transition-colors">
              {document.name}
            </h3>
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
              v{document.version}
            </span>
            {getStatusBadge()}
            {document.shared && (
              <Badge variant="primary">Shared</Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
            <span>{document.type}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 hidden sm:inline-block"></span>
            <span>{document.size}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 hidden sm:inline-block"></span>
            <span>Modified {formattedDate}</span>
            {document.ownerName && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 hidden sm:inline-block"></span>
                <span>By {document.ownerName}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3 sm:pt-0 sm:border-0 sm:ml-4">
        <Button
          variant="ghost"
          size="sm"
          className="p-2 text-gray-500 hover:text-primary-600"
          onClick={() => onPreview(document)}
          title="Preview"
        >
          <Eye size={18} />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="p-2 text-gray-500 hover:text-primary-600"
          onClick={() => onDownload(document)}
          title="Download"
        >
          <Download size={18} />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className={`p-2 ${document.shared ? 'text-primary-600' : 'text-gray-500 hover:text-primary-600'}`}
          onClick={() => onToggleShare(document)}
          title={document.shared ? 'Make Private' : 'Share'}
        >
          <Share2 size={18} />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="p-2 text-error-500 hover:text-error-600 hover:bg-error-50"
          onClick={() => onDelete(document.id)}
          title="Delete"
        >
          <Trash2 size={18} />
        </Button>
      </div>
    </div>
  );
};
