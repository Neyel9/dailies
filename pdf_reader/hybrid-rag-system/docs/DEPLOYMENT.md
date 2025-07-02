# 🚀 Deployment Guide

This guide covers various deployment options for the Hybrid RAG System, from local development to production cloud deployments.

## 📋 Prerequisites

### System Requirements
- **CPU**: 4+ cores recommended
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 50GB+ for documents and databases
- **Network**: Stable internet connection for LLM APIs

### Software Requirements
- **Docker**: 20.10+ with Docker Compose
- **Node.js**: 18+ (for local development)
- **Python**: 3.11+ (for local development)
- **Git**: For cloning the repository

## 🐳 Docker Compose Deployment (Recommended)

### Quick Start
```bash
# Clone repository
git clone <repository-url>
cd hybrid-rag-system

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start all services
docker-compose up -d

# Check status
docker-compose ps
```

### Production Configuration
```bash
# Use production compose file
docker-compose -f docker-compose.prod.yml up -d

# With monitoring stack
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

### Environment Configuration
Key environment variables for production:

```bash
# Application
NODE_ENV=production
APP_PORT=8000
FRONTEND_PORT=3000

# Security
CORS_ORIGINS=https://yourdomain.com
JWT_SECRET=your-secure-jwt-secret
RATE_LIMIT_MAX_REQUESTS=50

# LLM Provider
LLM_PROVIDER=openai
LLM_API_KEY=your-api-key
LLM_MODEL=gpt-4o-mini

# Databases
QDRANT_URL=http://qdrant:6333
NEO4J_URI=bolt://neo4j:7687
NEO4J_PASSWORD=your-secure-password
REDIS_PASSWORD=your-redis-password

# Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...

# Monitoring (optional)
SENTRY_DSN=your-sentry-dsn
PROMETHEUS_PORT=9090
```

## ☁️ Cloud Deployment

### AWS Deployment

#### ECS with Fargate
```bash
# Build and push images
docker build -t your-registry/hybrid-rag-frontend ./frontend
docker build -t your-registry/hybrid-rag-backend ./backend
docker build -t your-registry/hybrid-rag-agent ./agent

docker push your-registry/hybrid-rag-frontend
docker push your-registry/hybrid-rag-backend
docker push your-registry/hybrid-rag-agent

# Deploy using ECS CLI or CloudFormation
aws ecs create-cluster --cluster-name hybrid-rag-cluster
```

#### EKS (Kubernetes)
```bash
# Create EKS cluster
eksctl create cluster --name hybrid-rag --region us-west-2

# Apply Kubernetes manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/deployments/
kubectl apply -f k8s/services/
kubectl apply -f k8s/ingress.yaml
```

### Google Cloud Platform

#### Cloud Run
```bash
# Build and deploy frontend
gcloud builds submit --tag gcr.io/PROJECT-ID/hybrid-rag-frontend ./frontend
gcloud run deploy hybrid-rag-frontend --image gcr.io/PROJECT-ID/hybrid-rag-frontend

# Build and deploy backend
gcloud builds submit --tag gcr.io/PROJECT-ID/hybrid-rag-backend ./backend
gcloud run deploy hybrid-rag-backend --image gcr.io/PROJECT-ID/hybrid-rag-backend

# Build and deploy agent
gcloud builds submit --tag gcr.io/PROJECT-ID/hybrid-rag-agent ./agent
gcloud run deploy hybrid-rag-agent --image gcr.io/PROJECT-ID/hybrid-rag-agent
```

#### GKE
```bash
# Create GKE cluster
gcloud container clusters create hybrid-rag-cluster \
  --zone us-central1-a \
  --num-nodes 3 \
  --enable-autoscaling \
  --min-nodes 1 \
  --max-nodes 10

# Deploy using Helm
helm install hybrid-rag ./helm/hybrid-rag
```

### Azure Deployment

#### Container Instances
```bash
# Create resource group
az group create --name hybrid-rag-rg --location eastus

# Deploy container group
az container create \
  --resource-group hybrid-rag-rg \
  --file azure-container-instances.yaml
```

#### AKS
```bash
# Create AKS cluster
az aks create \
  --resource-group hybrid-rag-rg \
  --name hybrid-rag-aks \
  --node-count 3 \
  --enable-addons monitoring \
  --generate-ssh-keys

# Deploy application
kubectl apply -f k8s/
```

## 🔧 Configuration Management

### Environment-Specific Configs

#### Development
```bash
NODE_ENV=development
LOG_LEVEL=debug
ENABLE_DEBUG_MODE=true
ENABLE_HOT_RELOAD=true
```

#### Staging
```bash
NODE_ENV=staging
LOG_LEVEL=info
ENABLE_DEBUG_MODE=false
RATE_LIMIT_MAX_REQUESTS=75
```

#### Production
```bash
NODE_ENV=production
LOG_LEVEL=warn
ENABLE_DEBUG_MODE=false
RATE_LIMIT_MAX_REQUESTS=50
ENABLE_SOURCE_MAPS=false
```

### Secrets Management

#### Using Docker Secrets
```yaml
# docker-compose.prod.yml
services:
  backend:
    secrets:
      - llm_api_key
      - jwt_secret
    environment:
      - LLM_API_KEY_FILE=/run/secrets/llm_api_key

secrets:
  llm_api_key:
    external: true
  jwt_secret:
    external: true
```

#### Using Kubernetes Secrets
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: hybrid-rag-secrets
type: Opaque
data:
  llm-api-key: <base64-encoded-key>
  jwt-secret: <base64-encoded-secret>
```

## 📊 Monitoring and Observability

### Health Checks
```bash
# Check service health
curl http://localhost:8000/health
curl http://localhost:8001/health
curl http://localhost:3000/api/health

# Check database connections
curl http://localhost:6333/health
curl http://localhost:7474/db/system/tx/commit
```

### Logging Configuration
```yaml
# docker-compose.yml
services:
  backend:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Prometheus Metrics
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'hybrid-rag-backend'
    static_configs:
      - targets: ['backend:8000']
  - job_name: 'hybrid-rag-agent'
    static_configs:
      - targets: ['agent:8001']
```

## 🔒 Security Considerations

### Network Security
```yaml
# docker-compose.prod.yml
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true
  database:
    driver: bridge
    internal: true
```

### SSL/TLS Configuration
```nginx
# nginx.conf
server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;
    
    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Database Security
```bash
# Neo4j security
NEO4J_AUTH=neo4j/your-secure-password
NEO4J_dbms_security_auth__enabled=true

# Redis security
REDIS_PASSWORD=your-redis-password
```

## 🔄 CI/CD Pipeline

### GitHub Actions
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build and push images
        run: |
          docker build -t ${{ secrets.REGISTRY }}/frontend ./frontend
          docker push ${{ secrets.REGISTRY }}/frontend
          
      - name: Deploy to production
        run: |
          docker-compose -f docker-compose.prod.yml up -d
```

### GitLab CI
```yaml
# .gitlab-ci.yml
stages:
  - build
  - test
  - deploy

build:
  stage: build
  script:
    - docker build -t $CI_REGISTRY_IMAGE/frontend ./frontend
    - docker push $CI_REGISTRY_IMAGE/frontend

deploy:
  stage: deploy
  script:
    - docker-compose -f docker-compose.prod.yml up -d
  only:
    - main
```

## 🚨 Troubleshooting

### Common Issues

#### Service Won't Start
```bash
# Check logs
docker-compose logs backend
docker-compose logs agent
docker-compose logs frontend

# Check resource usage
docker stats
```

#### Database Connection Issues
```bash
# Test Qdrant connection
curl http://localhost:6333/health

# Test Neo4j connection
docker exec neo4j cypher-shell -u neo4j -p password "RETURN 1"

# Test Redis connection
docker exec redis redis-cli ping
```

#### Performance Issues
```bash
# Monitor resource usage
docker stats

# Check database performance
curl http://localhost:6333/metrics
```

### Recovery Procedures

#### Database Backup
```bash
# Backup Qdrant
docker exec qdrant qdrant-backup

# Backup Neo4j
docker exec neo4j neo4j-admin dump --database=neo4j --to=/backups/

# Backup Redis
docker exec redis redis-cli BGSAVE
```

#### Service Recovery
```bash
# Restart specific service
docker-compose restart backend

# Full system restart
docker-compose down
docker-compose up -d

# Reset databases (caution!)
docker-compose down -v
docker-compose up -d
```

## 📈 Scaling

### Horizontal Scaling
```yaml
# docker-compose.scale.yml
services:
  backend:
    deploy:
      replicas: 3
  
  agent:
    deploy:
      replicas: 2
      
  worker:
    deploy:
      replicas: 5
```

### Load Balancing
```yaml
# nginx load balancer
upstream backend {
    server backend1:8000;
    server backend2:8000;
    server backend3:8000;
}

upstream agent {
    server agent1:8001;
    server agent2:8001;
}
```

### Database Scaling
```yaml
# Qdrant cluster
services:
  qdrant-node1:
    image: qdrant/qdrant
    environment:
      - QDRANT__CLUSTER__ENABLED=true
      
  qdrant-node2:
    image: qdrant/qdrant
    environment:
      - QDRANT__CLUSTER__ENABLED=true
```

This deployment guide provides comprehensive instructions for deploying the Hybrid RAG System in various environments. Choose the deployment method that best fits your infrastructure and requirements.
