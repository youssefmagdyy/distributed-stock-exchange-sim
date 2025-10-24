FROM node:18 as build

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --force
COPY . .
RUN npm run build --force

FROM nginx:alpine
COPY --from=build /usr/src/app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
