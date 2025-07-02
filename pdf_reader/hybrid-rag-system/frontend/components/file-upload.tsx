'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Upload, 
  File, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  FileText,
  Clock
} from 'lucide-react';
import { formatBytes, formatDuration } from '@/lib/utils';

interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  jobId?: string;
  error?: string;
  result?: any;
}

export function FileUpload() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const { toast } = useToast();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadFile[] = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      status: 'pending',
      progress: 0,
    }));

    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    multiple: true,
  });

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(file => file.id !== id));
  };

  const uploadFile = async (uploadFile: UploadFile) => {
    const formData = new FormData();
    formData.append('pdf', uploadFile.file);
    formData.append('metadata', JSON.stringify({
      uploadedAt: new Date().toISOString(),
    }));

    try {
      // Update status to uploading
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'uploading', progress: 0 }
          : f
      ));

      const response = await fetch('/api/backend/upload/pdf', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      
      // Update status to processing
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { 
              ...f, 
              status: 'processing', 
              progress: 50,
              jobId: result.data.jobId 
            }
          : f
      ));

      // Poll for processing status
      await pollProcessingStatus(uploadFile.id, result.data.jobId);

    } catch (error) {
      console.error('Upload error:', error);
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { 
              ...f, 
              status: 'error', 
              error: error instanceof Error ? error.message : 'Upload failed'
            }
          : f
      ));

      toast({
        title: 'Upload Failed',
        description: `Failed to upload ${uploadFile.file.name}`,
        variant: 'destructive',
      });
    }
  };

  const pollProcessingStatus = async (fileId: string, jobId: string) => {
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/backend/upload/status/${jobId}`);
        
        if (!response.ok) {
          throw new Error('Failed to get status');
        }

        const status = await response.json();
        
        // Update progress based on status
        let progress = 50;
        if (status.status === 'processing') {
          progress = 50 + (status.progress || 0) * 0.4; // 50-90%
        } else if (status.status === 'completed') {
          progress = 100;
        }

        setFiles(prev => prev.map(f => 
          f.id === fileId 
            ? { 
                ...f, 
                progress,
                status: status.status === 'completed' ? 'completed' : 
                       status.status === 'failed' ? 'error' : 'processing',
                result: status.results,
                error: status.error?.message
              }
            : f
        ));

        if (status.status === 'completed') {
          toast({
            title: 'Processing Complete',
            description: `${status.data.filename} has been processed successfully`,
          });
          return;
        }

        if (status.status === 'failed') {
          toast({
            title: 'Processing Failed',
            description: status.error?.message || 'Processing failed',
            variant: 'destructive',
          });
          return;
        }

        // Continue polling if still processing
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000); // Poll every 5 seconds
        } else {
          throw new Error('Processing timeout');
        }

      } catch (error) {
        console.error('Polling error:', error);
        setFiles(prev => prev.map(f => 
          f.id === fileId 
            ? { 
                ...f, 
                status: 'error',
                error: 'Processing timeout or error'
              }
            : f
        ));
      }
    };

    // Start polling
    setTimeout(poll, 2000); // Initial delay
  };

  const uploadAllFiles = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    
    for (const file of pendingFiles) {
      await uploadFile(file);
      // Small delay between uploads
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case 'uploading':
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <File className="h-4 w-4" />;
    }
  };

  const getStatusText = (file: UploadFile) => {
    switch (file.status) {
      case 'pending':
        return 'Ready to upload';
      case 'uploading':
        return 'Uploading...';
      case 'processing':
        return 'Processing...';
      case 'completed':
        return 'Completed';
      case 'error':
        return file.error || 'Error';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = (status: UploadFile['status']) => {
    switch (status) {
      case 'pending':
        return 'secondary';
      case 'uploading':
      case 'processing':
        return 'default';
      case 'completed':
        return 'default';
      case 'error':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const processingCount = files.filter(f => f.status === 'uploading' || f.status === 'processing').length;
  const completedCount = files.filter(f => f.status === 'completed').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <Card 
        {...getRootProps()} 
        className={`upload-zone cursor-pointer transition-all duration-300 ${
          isDragActive ? 'dragover' : ''
        }`}
      >
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <input {...getInputProps()} />
          <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">
            {isDragActive ? 'Drop files here' : 'Upload PDF Documents'}
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Drag and drop PDF files here, or click to select files
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>• PDF files only</span>
            <span>• Max 50MB per file</span>
            <span>• Multiple files supported</span>
          </div>
        </CardContent>
      </Card>

      {/* Upload Summary */}
      {files.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex gap-4 text-sm">
            <span className="text-muted-foreground">
              {files.length} file{files.length !== 1 ? 's' : ''}
            </span>
            {pendingCount > 0 && (
              <Badge variant="secondary">{pendingCount} pending</Badge>
            )}
            {processingCount > 0 && (
              <Badge variant="default">{processingCount} processing</Badge>
            )}
            {completedCount > 0 && (
              <Badge variant="default">{completedCount} completed</Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="destructive">{errorCount} failed</Badge>
            )}
          </div>
          
          {pendingCount > 0 && (
            <Button onClick={uploadAllFiles} disabled={processingCount > 0}>
              Upload All ({pendingCount})
            </Button>
          )}
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          {files.map((uploadFile) => (
            <Card key={uploadFile.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-blue-500" />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{uploadFile.file.name}</p>
                      <Badge variant={getStatusColor(uploadFile.status) as any}>
                        {getStatusIcon(uploadFile.status)}
                        <span className="ml-1">{getStatusText(uploadFile)}</span>
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{formatBytes(uploadFile.file.size)}</span>
                      <span>{uploadFile.file.type}</span>
                      {uploadFile.result && (
                        <>
                          <span>•</span>
                          <span>{uploadFile.result.chunks_created} chunks</span>
                          <span>•</span>
                          <span>{formatDuration(uploadFile.result.processing_time_ms)}</span>
                        </>
                      )}
                    </div>

                    {(uploadFile.status === 'uploading' || uploadFile.status === 'processing') && (
                      <div className="mt-2">
                        <Progress value={uploadFile.progress} className="h-2" />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {uploadFile.progress.toFixed(0)}% complete
                        </p>
                      </div>
                    )}

                    {uploadFile.status === 'error' && uploadFile.error && (
                      <p className="mt-1 text-xs text-red-500">{uploadFile.error}</p>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(uploadFile.id)}
                    disabled={uploadFile.status === 'uploading' || uploadFile.status === 'processing'}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
