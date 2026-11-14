FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci
ARG APP
ARG NEXT_PUBLIC_WEB_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_ADMIN_URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN test "$APP" = web || test "$APP" = admin || test "$APP" = api
RUN npm run build --workspace=@anres/$APP
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG APP
ENV ANRES_APP=$APP
COPY --from=build --chown=node:node /app /app
USER node
CMD ["sh", "-c", "exec npm run start --workspace=@anres/$ANRES_APP"]
