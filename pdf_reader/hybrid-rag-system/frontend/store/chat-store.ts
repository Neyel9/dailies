'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolsUsed?: ToolCall[];
  sources?: Source[];
  isStreaming?: boolean;
  sessionId?: string;
}

export interface ToolCall {
  tool_name: string;
  args: Record<string, any>;
  result_summary?: string;
  execution_time_ms?: number;
}

export interface Source {
  chunk_id: string;
  document_id: string;
  content: string;
  score: number;
  document_title?: string;
  document_source?: string;
}

export interface ChatSession {
  id: string;
  name: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

interface ChatStore {
  // Current session
  currentSessionId: string;
  sessions: Record<string, ChatSession>;
  
  // UI state
  isLoading: boolean;
  streamingMessage: string;
  
  // Actions
  createSession: (name?: string) => string;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, name: string) => void;
  
  // Messages
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  clearMessages: (sessionId?: string) => void;
  
  // Streaming
  setIsLoading: (loading: boolean) => void;
  setStreamingMessage: (message: string) => void;
  
  // Utilities
  getCurrentSession: () => ChatSession | undefined;
  getSessionMessages: (sessionId: string) => Message[];
  searchMessages: (query: string) => Message[];
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      // Initial state
      currentSessionId: '',
      sessions: {},
      isLoading: false,
      streamingMessage: '',

      // Create a new chat session
      createSession: (name?: string) => {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const sessionName = name || `Chat ${Object.keys(get().sessions).length + 1}`;
        
        const newSession: ChatSession = {
          id: sessionId,
          name: sessionName,
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: newSession,
          },
          currentSessionId: sessionId,
        }));

        return sessionId;
      },

      // Switch to a different session
      switchSession: (sessionId: string) => {
        const { sessions } = get();
        if (sessions[sessionId]) {
          set({ currentSessionId: sessionId });
        }
      },

      // Delete a session
      deleteSession: (sessionId: string) => {
        set((state) => {
          const newSessions = { ...state.sessions };
          delete newSessions[sessionId];
          
          // If deleting current session, switch to another or create new
          let newCurrentSessionId = state.currentSessionId;
          if (state.currentSessionId === sessionId) {
            const remainingSessions = Object.keys(newSessions);
            newCurrentSessionId = remainingSessions.length > 0 
              ? remainingSessions[0] 
              : '';
          }

          return {
            sessions: newSessions,
            currentSessionId: newCurrentSessionId,
          };
        });
      },

      // Rename a session
      renameSession: (sessionId: string, name: string) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                name,
                updatedAt: new Date(),
              },
            },
          };
        });
      },

      // Add a new message to current session
      addMessage: (message) => {
        const { currentSessionId, sessions } = get();
        
        // Create session if none exists
        let sessionId = currentSessionId;
        if (!sessionId || !sessions[sessionId]) {
          sessionId = get().createSession();
        }

        const newMessage: Message = {
          ...message,
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          sessionId,
        };

        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...state.sessions[sessionId],
              messages: [...state.sessions[sessionId].messages, newMessage],
              updatedAt: new Date(),
            },
          },
        }));
      },

      // Update an existing message
      updateMessage: (messageId: string, updates: Partial<Message>) => {
        const { currentSessionId, sessions } = get();
        const session = sessions[currentSessionId];
        
        if (!session) return;

        set((state) => ({
          sessions: {
            ...state.sessions,
            [currentSessionId]: {
              ...session,
              messages: session.messages.map((msg) =>
                msg.id === messageId ? { ...msg, ...updates } : msg
              ),
              updatedAt: new Date(),
            },
          },
        }));
      },

      // Clear messages from a session
      clearMessages: (sessionId?: string) => {
        const targetSessionId = sessionId || get().currentSessionId;
        const { sessions } = get();
        const session = sessions[targetSessionId];
        
        if (!session) return;

        set((state) => ({
          sessions: {
            ...state.sessions,
            [targetSessionId]: {
              ...session,
              messages: [],
              updatedAt: new Date(),
            },
          },
        }));
      },

      // Set loading state
      setIsLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      // Set streaming message
      setStreamingMessage: (message: string) => {
        set({ streamingMessage: message });
      },

      // Get current session
      getCurrentSession: () => {
        const { currentSessionId, sessions } = get();
        return sessions[currentSessionId];
      },

      // Get messages for a specific session
      getSessionMessages: (sessionId: string) => {
        const { sessions } = get();
        return sessions[sessionId]?.messages || [];
      },

      // Search messages across all sessions
      searchMessages: (query: string) => {
        const { sessions } = get();
        const allMessages: Message[] = [];
        
        Object.values(sessions).forEach((session) => {
          allMessages.push(...session.messages);
        });

        if (!query.trim()) {
          return allMessages;
        }

        const lowercaseQuery = query.toLowerCase();
        return allMessages.filter((message) =>
          message.content.toLowerCase().includes(lowercaseQuery) ||
          message.sources?.some((source) =>
            source.content.toLowerCase().includes(lowercaseQuery) ||
            source.document_title?.toLowerCase().includes(lowercaseQuery)
          )
        );
      },
    }),
    {
      name: 'chat-store',
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
      }),
    }
  )
);

// Utility hooks
export const useCurrentSession = () => {
  return useChatStore((state) => state.getCurrentSession());
};

export const useCurrentMessages = () => {
  return useChatStore((state) => {
    const session = state.getCurrentSession();
    return session?.messages || [];
  });
};

export const useSessionList = () => {
  return useChatStore((state) => 
    Object.values(state.sessions).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    )
  );
};
