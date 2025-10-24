#!/bin/bash

# Start Minikube if not already started
echo "Starting Minikube..."
minikube start

# Install Metrics Server and RabbitMQ
echo "Installing Metrics Server and RabbitMQ..."
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
helm install rabbitmq bitnami/rabbitmq

# Build the Docker images
echo "Building Docker images..."
# eval $(minikube -p minikube docker-env)

# Build each service's Docker image
docker build -t market-data-publisher:latest ./k8s/market-data-publisher
docker build -t order-manager:latest ./k8s/order-manager
docker build -t client-gateway:latest ./k8s/client_order_streamer
docker build -t matching-engine:latest ./k8s/matching-engine
docker build -t exchange-dashboard-frontend:latest ./k8s/exchange-dashboard/frontend

echo "Docker images built successfully."

# Load Docker images into Minikube
echo "Loading Docker images into Minikube..."
minikube image load market-data-publisher:latest
minikube image load order-manager:latest
minikube image load client-gateway:latest
minikube image load matching-engine:latest
minikube image load exchange-dashboard-frontend:latest

echo "Docker images loaded into Minikube successfully."

# Deploy Redis
echo "Deploying Redis..."
kubectl apply -f redis-deployment.yaml
kubectl apply -f redis-service.yaml
echo "Redis deployed."

# Enable the Metrics Server addon in Minikube
echo "Enabling Metrics Server..."
minikube addons enable metrics-server

# Wait for the Metrics Server, RabbitMQ, and Redis to be ready
echo "Waiting for Metrics Server, RabbitMQ, and Redis to be ready..."
kubectl rollout status deployment/metrics-server -n kube-system
kubectl rollout status deployment/redis
kubectl wait --for=condition=ready pod/rabbitmq-0 -n default

# Set up RabbitMQ user and permissions
echo "Setting up RabbitMQ user..."
kubectl exec -it rabbitmq-0 -- rabbitmqctl add_user guest guest
kubectl exec -it rabbitmq-0 -- rabbitmqctl set_user_tags guest administrator
kubectl exec -it rabbitmq-0 -- sh -c "rabbitmqctl set_permissions -p / guest '.*' '.*' '.*'"

# Deploy Order Manager
echo "Deploying Order Manager..."
kubectl apply -f order-manager-deployment.yaml
kubectl apply -f order-manager-service.yaml
echo "Order Manager deployed."

# Deploy Market Data Publisher
echo "Deploying Market Data Publisher..."
kubectl apply -f market-data-publisher-deployment.yaml
kubectl apply -f market-data-publisher-service.yaml
echo "Market Data Publisher deployed."

# Deploy Matching Engine
echo "Deploying Matching Engine..."
kubectl apply -f matching-engine-deployment.yaml
kubectl apply -f matching-engine-service.yaml
echo "Matching Engine deployed."

# Deploy Exchange Dashboard
echo "Deploying Exchange Dashboard..."
kubectl apply -f exchange-dashboard-deployment.yaml
kubectl apply -f exchange-dashboard-service.yaml
echo "Exchange Dashboard deployed."

# Deploy Horizontal Pod Autoscalers (HPAs)
echo "Deploying HPAs..."
kubectl apply -f order-manager-hpa.yaml
kubectl apply -f market-data-publisher-hpa.yaml
kubectl apply -f matching-engine-hpa.yaml
kubectl apply -f exchange-dashboard-hpa.yaml
echo "HPAs deployed."

# Wait for all deployments to be successfully rolled out
echo "Waiting for all services to be fully deployed..."
kubectl rollout status deployment/order-manager
kubectl rollout status deployment/market-data-publisher
kubectl rollout status deployment/matching-engine
kubectl rollout status deployment/exchange-dashboard

# Port-forward Redis, RabbitMQ, Exchange Dashboard and Market Data Publisher services
echo "Port-forwarding Redis, RabbitMQ, Exchange Dashboard, and Market Data Publisher..."
kubectl port-forward service/redis 6379:6379 &
kubectl port-forward svc/exchange-dashboard 80:80 &
kubectl port-forward svc/rabbitmq 15672:15672 &
kubectl port-forward svc/market-data-publisher 3003:3003 &

Deploy Client Gateway
echo "Client Gateway will deploy in 30 seconds."
sleep 30
echo "Deploying Client Gateway..."
kubectl apply -f client-gateway-deployment.yaml
kubectl apply -f client-gateway-service.yaml
echo "Client Gateway deployed."

echo "All services have been successfully deployed!"
echo "Script should keep running for port forwarding to work"
sleep 60000
## Script should keep running for port forwarding to work