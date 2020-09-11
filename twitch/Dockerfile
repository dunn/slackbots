FROM node:lts-alpine

WORKDIR /twitch

COPY package.json ./
RUN npm install

COPY . .
CMD node twitch-ping.js
