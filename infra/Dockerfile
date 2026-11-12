FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
ARG APP
RUN test "$APP" = web || test "$APP" = admin || test "$APP" = api
RUN npm run build --workspace=@anres/$APP

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ARG APP
ENV ANRES_APP=$APP
COPY --from=build --chown=node:node /app /app
USER node
CMD ["sh", "-c", "exec npm run start --workspace=@anres/$ANRES_APP"]
