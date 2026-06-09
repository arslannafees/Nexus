import React, { useRef, useState, useEffect } from 'react';
import { PenTool, Type, Trash2, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';

interface SignaturePadProps {
  documentId: string;
  onClose: () => void;
  onSignatureSuccess: () => void;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  documentId,
  onClose,
  onSignatureSuccess,
}) => {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState<string>('');
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    if (mode === 'draw') {
      initCanvas();
    }
  }, [mode]);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use responsive width/height
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.scale(2, 2);
    context.lineCap = 'round';
    context.strokeStyle = '#1e3a8a'; // deep blue pen color
    context.lineWidth = 2.5;
    contextRef.current = context;

    // Set background to white
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, rect.width, rect.height);
  };

  const getEventCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getEventCoordinates(e);
    contextRef.current?.beginPath();
    contextRef.current?.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getEventCoordinates(e);
    contextRef.current?.lineTo(x, y);
    contextRef.current?.stroke();
  };

  const stopDrawing = () => {
    contextRef.current?.closePath();
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !contextRef.current) return;
    const rect = canvas.getBoundingClientRect();
    contextRef.current.fillStyle = '#ffffff';
    contextRef.current.fillRect(0, 0, rect.width, rect.height);
  };

  const convertTypedToImage = (): string => {
    // Generate a temporary canvas to draw the typed text as an image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 500;
    tempCanvas.height = 200;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 500, 200);

    // Use beautiful cursive font
    ctx.font = 'italic 36px "Dancing Script", "Caveat", "Brush Script MT", cursive, serif';
    ctx.fillStyle = '#1e3a8a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName || 'Your Signature', 250, 100);

    // Optional: Draw a nice elegant line underneath
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(100, 140);
    ctx.lineTo(400, 140);
    ctx.stroke();

    return tempCanvas.toDataURL('image/png');
  };

  const handleApply = async () => {
    let base64Image = '';

    if (mode === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      base64Image = canvas.toDataURL('image/png');
    } else {
      if (!typedName.trim()) {
        toast.error('Please enter your name for the signature');
        return;
      }
      base64Image = convertTypedToImage();
    }

    setLoading(true);

    try {
      const response = await api.post(`/documents/${documentId}/signatures`, {
        signatureData: base64Image,
        signatureType: mode,
      });

      if (response.status === 201) {
        toast.success('Document signed successfully!');
        onSignatureSuccess();
      }
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err.response?.data?.message || 'Failed to apply signature';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex border-b border-gray-200">
        <button
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            mode === 'draw'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setMode('draw')}
        >
          <PenTool size={16} /> Draw Signature
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            mode === 'type'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setMode('type')}
        >
          <Type size={16} /> Type Signature
        </button>
      </div>

      {mode === 'draw' ? (
        <div className="space-y-2">
          <div className="relative border border-gray-250 rounded-xl bg-white overflow-hidden shadow-inner h-[220px]">
            <canvas
              ref={canvasRef}
              className="w-full h-full cursor-crosshair touch-none bg-white"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            <button
              onClick={clearCanvas}
              className="absolute bottom-3 right-3 p-2 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-error-600 border border-gray-200 rounded-lg transition-colors shadow-sm"
              title="Clear Canvas"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Use your mouse or touch screen to draw your signature inside the area.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700">Enter Your Full Name</label>
            <input
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="e.g. John Doe"
              maxLength={40}
              className="w-full px-3 py-2 border border-gray-355 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>

          <div className="border border-gray-200 rounded-xl p-6 bg-gray-50/50 flex items-center justify-center min-h-[120px]">
            {typedName ? (
              <span className="text-4xl text-blue-900 font-medium font-serif italic tracking-wide select-none">
                {typedName}
              </span>
            ) : (
              <span className="text-sm text-gray-400 italic">Signature Preview</span>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleApply}
          disabled={loading}
          leftIcon={loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
        >
          {loading ? 'Saving...' : 'Apply Signature'}
        </Button>
      </div>
    </div>
  );
};
