# Wir nutzen Node 24 (Alpine Version für minimalen Speicherplatz)
FROM node:24-alpine

# Arbeitsverzeichnis im Container
WORKDIR /app

# Abhängigkeiten installieren
COPY package*.json ./
RUN npm install --omit=dev

# Restlichen Code kopieren
COPY . .

# Port freigeben
EXPOSE 8444

# Starten
CMD ["node", "server.js"]