ARG BASE_REGISTRY=docker.io/library

FROM ${BASE_REGISTRY}/node:20-alpine AS build
WORKDIR /app
# Registre npm. Surchargeable pour pointer vers un miroir prive ; NPM_STRICT_SSL=false
# permet d'utiliser un miroir dont le certificat n'est pas present dans l'image.
ARG NPM_REGISTRY=https://registry.npmjs.org/
ARG NPM_STRICT_SSL=true
RUN npm config set registry ${NPM_REGISTRY} \
    && npm config set strict-ssl ${NPM_STRICT_SSL}
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM ${BASE_REGISTRY}/nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
