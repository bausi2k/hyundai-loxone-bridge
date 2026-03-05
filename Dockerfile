FROM node:24-alpine

WORKDIR /app

# 1. Zuerst kopieren wir NUR unsere lokale Bibliothek
COPY bluelinky-src ./bluelinky-src

# 2. Wir wechseln in die Bibliothek, installieren deren Abhängigkeiten und bauen sie (Kompilieren nach /dist)
RUN cd bluelinky-src && npm install && npm run build

# 3. Jetzt kopieren wir die package.json für unseren eigentlichen Server
COPY package*.json ./

# 4. Installieren die Server-Abhängigkeiten (npm verlinkt jetzt automatisch auf unseren gebauten bluelinky-src Ordner)
RUN npm install

# 5. Restlichen Code (server.js, public Ordner etc.) kopieren
COPY . .

EXPOSE 8444

CMD ["node", "server.js"]