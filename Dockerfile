FROM node:22


# Install Docker CLI inside the container (for Docker-in-Docker)
RUN apt-get update && apt-get install -y \
    docker.io \
    && rm -rf /var/lib/apt/lists/*


WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5001

CMD ["node", "index.js"]

