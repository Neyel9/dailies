'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useChatStore } from '@/store/chat-store';
import { 
  Send, 
  Bot, 
  User, 
  Loader2, 
  Search, 
  Network, 
  Database,
  FileText,
  Clock,
  Copy,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolsUsed?: ToolCall[];
  sources?: Source[];
  isStreaming?: boolean;
}

interface ToolCall {
  tool_name: string;
  args: Record<string, any>;
  result_summary?: string;
  execution_time_ms?: number;
}

interface Source {
  chunk_id: string;
  document_id: string;
  content: string;
  score: number;
  document_title?: string;
  document_source?: string;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setStreamingMessage('');

    try {
      const response = await fetch('/api/agent/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: input.trim(),
          session_id: 'default',
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream');
      }

      let assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolsUsed: [],
        sources: [],
        isStreaming: true,
      };

      setMessages(prev => [...prev, assistantMessage]);

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'text') {
                assistantMessage.content += data.content || '';
                setStreamingMessage(assistantMessage.content);
              } else if (data.type === 'tools') {
                assistantMessage.toolsUsed = data.tools || [];
              } else if (data.type === 'sources') {
                assistantMessage.sources = data.sources || [];
              } else if (data.type === 'end') {
                assistantMessage.isStreaming = false;
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessage.id ? assistantMessage : msg
                  )
                );
                setStreamingMessage('');
              } else if (data.type === 'error') {
                throw new Error(data.error || 'Stream error');
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive',
      });
      
      // Remove the failed assistant message
      setMessages(prev => prev.filter(msg => msg.id !== (Date.now() + 1).toString()));
    } finally {
      setIsLoading(false);
      setStreamingMessage('');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copied',
        description: 'Message copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy message',
        variant: 'destructive',
      });
    }
  };

  const getToolIcon = (toolName: string) => {
    switch (toolName) {
      case 'vector_search':
        return <Search className="h-3 w-3" />;
      case 'graph_search':
        return <Network className="h-3 w-3" />;
      case 'hybrid_search':
        return <Database className="h-3 w-3" />;
      case 'document_retrieval':
        return <FileText className="h-3 w-3" />;
      default:
        return <Bot className="h-3 w-3" />;
    }
  };

  const formatToolName = (toolName: string) => {
    return toolName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="flex h-[600px] flex-col">
      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground">
              <Bot className="mx-auto mb-2 h-8 w-8" />
              <p>Start a conversation by asking about your documents</p>
              <p className="text-sm">Try: "What are the main topics in my documents?"</p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className="message-enter">
              <div className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.role === 'assistant' && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className={`max-w-[80%] space-y-2 ${message.role === 'user' ? 'order-first' : ''}`}>
                  <Card className={message.role === 'user' ? 'bg-primary text-primary-foreground' : ''}>
                    <CardContent className="p-3">
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown
                          components={{
                            code({ node, inline, className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || '');
                              return !inline && match ? (
                                <SyntaxHighlighter
                                  style={oneDark}
                                  language={match[1]}
                                  PreTag="div"
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              ) : (
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              );
                            },
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                        {message.isStreaming && streamingMessage && (
                          <span className="streaming-text">{streamingMessage}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Tools Used */}
                  {message.toolsUsed && message.toolsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-xs text-muted-foreground">Tools used:</span>
                      {message.toolsUsed.map((tool, index) => (
                        <TooltipProvider key={index}>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="secondary" className="text-xs">
                                {getToolIcon(tool.tool_name)}
                                <span className="ml-1">{formatToolName(tool.tool_name)}</span>
                                {tool.execution_time_ms && (
                                  <span className="ml-1 text-muted-foreground">
                                    ({tool.execution_time_ms}ms)
                                  </span>
                                )}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="max-w-xs">
                                <p className="font-medium">{formatToolName(tool.tool_name)}</p>
                                {tool.result_summary && (
                                  <p className="text-sm text-muted-foreground">{tool.result_summary}</p>
                                )}
                                <pre className="mt-1 text-xs">
                                  {JSON.stringify(tool.args, null, 2)}
                                </pre>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                    </div>
                  )}

                  {/* Sources */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs text-muted-foreground">Sources:</span>
                      <div className="space-y-1">
                        {message.sources.slice(0, 3).map((source, index) => (
                          <Card key={index} className="bg-muted/50">
                            <CardContent className="p-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">
                                    {source.document_title || source.document_source || 'Unknown Document'}
                                  </p>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {source.content.slice(0, 100)}...
                                  </p>
                                </div>
                                <Badge variant="outline" className="text-xs">
                                  {(source.score * 100).toFixed(0)}%
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                        {message.sources.length > 3 && (
                          <p className="text-xs text-muted-foreground">
                            +{message.sources.length - 3} more sources
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Message Actions */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(message.content)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    {message.role === 'assistant' && (
                      <>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <ThumbsUp className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <ThumbsDown className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {message.role === 'user' && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <Separator />

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your documents..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
