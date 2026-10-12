FROM node:22-alpine
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/.data
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /app/.data && chown -R node:node /app/.data
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
