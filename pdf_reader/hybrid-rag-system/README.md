# 🧠 Hybrid RAG System

A production-ready RAG (Retrieval-Augmented Generation) system that combines the best of both worlds: **modern web interfaces** with **advanced AI agent capabilities**. This system integrates vector search with knowledge graphs for unprecedented document understanding and intelligent question answering.

## 🌟 Key Features

### **🤖 Advanced AI Agent**
- **Pydantic AI Framework**: Intelligent agent with tool selection and reasoning
- **Tool Transparency**: Real-time display of which tools the agent uses
- **Streaming Responses**: Live AI responses with Server-Sent Events
- **Multi-LLM Support**: OpenAI, Ollama, OpenRouter, Gemini, and more

### **🔍 Hybrid Search System**
- **Vector Similarity**: Semantic search across document chunks (Qdrant)
- **Knowledge Graph**: Entity relationships and temporal connections (Neo4j + Graphiti)
- **Hybrid Approach**: Intelligent ranking and merging of search results
- **Tool Selection**: Agent automatically chooses the best search strategy

### **🌐 Modern Web Interface**
- **Next.js 15**: React framework with App Router and TypeScript
- **Real-time Streaming**: Live AI responses with typing indicators
- **Tool Usage Display**: Visual representation of agent reasoning
- **Clerk Authentication**: Secure user management
- **Responsive Design**: Works on desktop and mobile

### **📄 Comprehensive PDF Processing**
- **Advanced Text Extraction**: PyPDF2 with OCR fallback (Tesseract)
- **Semantic Chunking**: LLM-assisted intelligent document segmentation
- **Background Processing**: BullMQ queue system with Redis
- **Progress Tracking**: Real-time processing status updates

### **🏗️ Production Ready**
- **Docker Compose**: Complete containerized deployment
- **Microservices**: Separate backend, agent, and frontend services
- **Error Handling**: Comprehensive error management and logging
- **Health Monitoring**: System status and performance metrics
- **Scalable Architecture**: Horizontal scaling support

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend Layer                       │
│  ┌─────────────────┐        ┌────────────────────┐     │
│  │   Next.js UI    │        │   Clerk Auth       │     │
│  │   + Streaming   │        │   + Real-time      │     │
│  └────────┬────────┘        └────────────────────┘     │
│           │                                              │
├───────────┴──────────────────────────────────────────────┤
│                    API Gateway Layer                    │
│  ┌─────────────────┐        ┌────────────────────┐     │
│  │  Node.js/Express│        │   BullMQ Queue     │     │
│  │  File Upload    │◄──────►│   + Redis          │     │
│  └────────┬────────┘        └────────────────────┘     │
│           │                                              │
├───────────┴──────────────────────────────────────────────┤
│                    AI Agent Layer                       │
│  ┌─────────────────┐        ┌────────────────────┐     │
│  │  Pydantic AI    │        │   Agent Tools      │     │
│  │    Agent        │◄──────►│  - Vector Search   │     │
│  └────────┬────────┘        │  - Graph Search    │     │
│           │                 │  - Hybrid Search   │     │
│           │                 └────────────────────┘     │
├───────────┴──────────────────────────────────────────────┤
│                  Storage Layer                          │
│  ┌─────────────────┐        ┌────────────────────┐     │
│  │     Qdrant      │        │      Neo4j         │     │
│  │  Vector Store   │        │   Knowledge Graph  │     │
│  └─────────────────┘        └────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Key Features

### **Advanced AI Agent Capabilities**
- **Intelligent Tool Selection**: Agent automatically chooses the best search strategy
- **Tool Transparency**: Real-time display of which tools the agent uses
- **Streaming Responses**: Server-Sent Events for real-time AI responses
- **Multi-LLM Support**: OpenAI, Ollama, OpenRouter, Gemini

### **Hybrid Search System**
- **Vector Similarity**: Semantic search across document chunks (Qdrant)
- **Knowledge Graph**: Entity relationships and temporal connections (Neo4j + Graphiti)
- **Combined Results**: Intelligent ranking and merging of search results

### **Modern Web Interface**
- **Real-time Streaming**: Live AI responses with typing indicators
- **Tool Usage Display**: Visual representation of agent reasoning
- **File Upload**: Drag-and-drop PDF processing
- **Authentication**: Secure user management with Clerk

### **Production Ready**
- **Docker Compose**: Complete containerized deployment
- **Queue System**: Background PDF processing with BullMQ
- **Error Handling**: Comprehensive error management and logging
- **Testing**: Full test suite for all components

## 📁 Project Structure

```
hybrid-rag-system/
├── frontend/                   # Next.js React application
│   ├── app/                   # App router pages
│   ├── components/            # Reusable UI components
│   ├── lib/                   # Utilities and configurations
│   └── package.json
├── backend/                   # Node.js Express server
│   ├── src/                   # Source code
│   ├── uploads/               # File upload directory
│   └── package.json
├── agent/                     # Python AI agent system
│   ├── agent/                 # Core agent implementation
│   ├── ingestion/             # PDF processing pipeline
│   ├── tools/                 # Agent tools and utilities
│   └── requirements.txt
├── docker-compose.yml         # Complete deployment setup
├── .env.example              # Environment configuration
└── README.md                 # This file
```

## 🛠️ Technology Stack

### **Frontend**
- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Modern styling
- **Clerk**: Authentication and user management
- **Server-Sent Events**: Real-time streaming

### **Backend**
- **Node.js/Express**: API server and file handling
- **BullMQ**: Queue system for background processing
- **Redis**: Queue storage and caching
- **Multer**: File upload handling

### **AI Agent**
- **Pydantic AI**: Agent framework with tool support
- **Graphiti**: Knowledge graph management
- **FastAPI**: Python API endpoints
- **AsyncPG**: PostgreSQL async driver

### **Databases**
- **Qdrant**: Vector database for embeddings
- **Neo4j**: Graph database for relationships
- **Redis**: Queue and cache storage

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and Python 3.11+
- Docker and Docker Compose
- OpenAI API key (or other LLM provider)

### 1. Clone and Setup
```bash
git clone <repository>
cd hybrid-rag-system
cp .env.example .env
# Edit .env with your API keys and configurations
```

### 2. Start Infrastructure
```bash
docker-compose up -d qdrant neo4j redis
```

### 3. Install Dependencies
```bash
# Frontend
cd frontend && npm install

# Backend
cd ../backend && npm install

# Agent
cd ../agent && pip install -r requirements.txt
```

### 4. Start Services
```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Agent API
cd agent && python -m agent.api

# Terminal 3: Frontend
cd frontend && npm run dev

# Terminal 4: Queue Worker
cd backend && npm run worker
```

### 5. Access Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Agent API**: http://localhost:8001
- **Qdrant**: http://localhost:6333
- **Neo4j**: http://localhost:7474

## 📖 Usage

1. **Upload PDF**: Drag and drop PDF files in the web interface
2. **Wait for Processing**: Files are processed in the background
3. **Ask Questions**: Chat with the AI agent about your documents
4. **View Tool Usage**: See which search methods the agent used
5. **Explore Results**: Get answers with source citations and reasoning

## 🔧 Configuration

See `.env.example` for all configuration options including:
- LLM provider settings (OpenAI, Ollama, etc.)
- Database connections
- Authentication settings
- Processing parameters

## 🧪 Testing

```bash
# Frontend tests
cd frontend && npm test

# Backend tests
cd backend && npm test

# Agent tests
cd agent && pytest
```

## 📚 Documentation

- [API Documentation](./docs/api.md)
- [Agent Tools](./docs/agent-tools.md)
- [Deployment Guide](./docs/deployment.md)
- [Development Setup](./docs/development.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

---

Built with ❤️ using Next.js, Pydantic AI, Qdrant, and Neo4j.
