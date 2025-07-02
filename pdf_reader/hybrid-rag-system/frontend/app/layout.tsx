import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/theme-provider';
import { QueryProvider } from '@/components/query-provider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Hybrid RAG System',
  description: 'AI-powered document analysis with vector search and knowledge graphs',
  keywords: [
    'AI',
    'RAG',
    'document analysis',
    'vector search',
    'knowledge graph',
    'PDF processing',
    'semantic search',
  ],
  authors: [{ name: 'Hybrid RAG Team' }],
  creator: 'Hybrid RAG System',
  publisher: 'Hybrid RAG System',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://hybrid-rag.example.com',
    title: 'Hybrid RAG System',
    description: 'AI-powered document analysis with vector search and knowledge graphs',
    siteName: 'Hybrid RAG System',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Hybrid RAG System',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hybrid RAG System',
    description: 'AI-powered document analysis with vector search and knowledge graphs',
    images: ['/og-image.png'],
    creator: '@hybridrag',
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      appearance={{
        baseTheme: undefined,
        variables: {
          colorPrimary: 'hsl(221.2 83.2% 53.3%)',
          colorBackground: 'hsl(0 0% 100%)',
          colorInputBackground: 'hsl(0 0% 100%)',
          colorInputText: 'hsl(222.2 84% 4.9%)',
        },
        elements: {
          formButtonPrimary: 'btn-primary',
          card: 'card',
          headerTitle: 'text-2xl font-bold',
          headerSubtitle: 'text-muted-foreground',
        },
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="theme-color" content="#3b82f6" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        </head>
        <body className={`${inter.className} antialiased`}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>
              <div className="relative flex min-h-screen flex-col">
                <div className="flex-1">{children}</div>
              </div>
              <Toaster />
            </QueryProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
