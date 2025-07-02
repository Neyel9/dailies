'use client';

import { useState } from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FileUpload } from '@/components/file-upload';
import { ChatInterface } from '@/components/chat-interface';
import { SearchInterface } from '@/components/search-interface';
import { DocumentLibrary } from '@/components/document-library';
import { SystemStatus } from '@/components/system-status';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  Brain,
  Search,
  Upload,
  MessageSquare,
  Library,
  Settings,
  Zap,
  Network,
  Database,
} from 'lucide-react';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('chat');

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Brain className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-xl font-bold">Hybrid RAG</h1>
                <p className="text-xs text-muted-foreground">AI Document Intelligence</p>
              </div>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center space-x-2">
              <Badge variant="secondary" className="text-xs">
                <Zap className="mr-1 h-3 w-3" />
                Vector Search
              </Badge>
              <Badge variant="secondary" className="text-xs">
                <Network className="mr-1 h-3 w-3" />
                Knowledge Graph
              </Badge>
              <Badge variant="secondary" className="text-xs">
                <Database className="mr-1 h-3 w-3" />
                Real-time AI
              </Badge>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <SystemStatus />
            <ThemeToggle />
            <SignedIn>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: 'h-8 w-8',
                  },
                }}
              />
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <Button variant="outline" size="sm">
                  Sign In
                </Button>
              </SignInButton>
            </SignedOut>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        <SignedOut>
          {/* Landing Page for Unauthenticated Users */}
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-8">
              <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-6xl">
                Intelligent Document
                <span className="text-gradient"> Analysis</span>
              </h1>
              <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                Upload PDFs and get instant answers using advanced AI that combines vector search
                with knowledge graphs for unprecedented document understanding.
              </p>
            </div>

            <div className="mb-12 grid gap-6 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <Search className="mx-auto h-12 w-12 text-primary" />
                  <CardTitle>Semantic Search</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Find information by meaning, not just keywords. Our vector search understands
                    context and intent.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <Network className="mx-auto h-12 w-12 text-primary" />
                  <CardTitle>Knowledge Graphs</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Discover relationships between entities and concepts across your documents
                    automatically.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <MessageSquare className="mx-auto h-12 w-12 text-primary" />
                  <CardTitle>AI Chat</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Ask questions in natural language and get detailed answers with source
                    citations and reasoning.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <SignInButton mode="modal">
                <Button size="lg" className="text-lg">
                  Get Started Free
                </Button>
              </SignInButton>
              <p className="text-sm text-muted-foreground">
                No credit card required • Process up to 10 documents free
              </p>
            </div>
          </div>
        </SignedOut>

        <SignedIn>
          {/* Main Application Interface */}
          <div className="space-y-6">
            {/* Welcome Section */}
            <div className="rounded-lg border bg-card p-6">
              <h2 className="mb-2 text-2xl font-bold">Welcome to Hybrid RAG</h2>
              <p className="text-muted-foreground">
                Upload documents, ask questions, and discover insights with AI-powered analysis.
              </p>
            </div>

            {/* Main Interface Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="chat" className="flex items-center space-x-2">
                  <MessageSquare className="h-4 w-4" />
                  <span>Chat</span>
                </TabsTrigger>
                <TabsTrigger value="upload" className="flex items-center space-x-2">
                  <Upload className="h-4 w-4" />
                  <span>Upload</span>
                </TabsTrigger>
                <TabsTrigger value="search" className="flex items-center space-x-2">
                  <Search className="h-4 w-4" />
                  <span>Search</span>
                </TabsTrigger>
                <TabsTrigger value="library" className="flex items-center space-x-2">
                  <Library className="h-4 w-4" />
                  <span>Library</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex items-center space-x-2">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="chat" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <MessageSquare className="h-5 w-5" />
                      <span>AI Chat Assistant</span>
                    </CardTitle>
                    <CardDescription>
                      Ask questions about your documents and get intelligent answers with source
                      citations and tool transparency.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChatInterface />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="upload" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Upload className="h-5 w-5" />
                      <span>Document Upload</span>
                    </CardTitle>
                    <CardDescription>
                      Upload PDF documents to add them to your knowledge base for AI analysis.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FileUpload />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="search" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Search className="h-5 w-5" />
                      <span>Advanced Search</span>
                    </CardTitle>
                    <CardDescription>
                      Search your documents using vector similarity, knowledge graphs, or hybrid
                      approaches.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SearchInterface />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="library" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Library className="h-5 w-5" />
                      <span>Document Library</span>
                    </CardTitle>
                    <CardDescription>
                      Manage your uploaded documents and view processing status.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DocumentLibrary />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="settings" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Settings className="h-5 w-5" />
                      <span>System Settings</span>
                    </CardTitle>
                    <CardDescription>
                      Configure search preferences, AI models, and system behavior.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <p className="text-muted-foreground">Settings panel coming soon...</p>
                      <SystemStatus detailed />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </SignedIn>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/50 py-8">
        <div className="container text-center text-sm text-muted-foreground">
          <p>
            © 2024 Hybrid RAG System. Built with Next.js, Pydantic AI, Qdrant, and Neo4j.
          </p>
        </div>
      </footer>
    </div>
  );
}
