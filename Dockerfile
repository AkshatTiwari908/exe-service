FROM node:22



RUN apt-get update && apt-get install -y curl

# Download Docker CLI binary manually
RUN curl -L https://download.docker.com/linux/static/stable/x86_64/docker-25.0.3.tgz | tar -xzv && \
    mv docker/* /usr/bin/ && \
    rm -rf docker


# Install Docker CLI inside the container (for Docker-in-Docker
RUN apt-get update && apt-get install -y docker.io

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5001

CMD ["node", "index.js"]

