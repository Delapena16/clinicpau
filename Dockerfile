# Dr. Pau ABTC PEP Registry — Node.js application image
FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /usr/src/app

# Install production dependencies first (cached layer unless package files change)
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy application source
COPY . .

# The MFA/audit loggers write to ./logs — make sure the non-root user can write there
RUN mkdir -p logs && chown -R node:node /usr/src/app

# Run as the unprivileged built-in "node" user
USER node

EXPOSE 5000

CMD ["node", "server.js"]
