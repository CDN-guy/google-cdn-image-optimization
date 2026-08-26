# build base used for global libvips
FROM node:20-alpine3.20 AS builder

# install jxl for JPEG XL support 
# To-do: add "vips-heif" back once AVIF issue is fixed
RUN apk update && \
    apk add vips && \
    apk add vips-jxl && \
    apk add vips-tools && \
    apk add vips-cpp && \
    apk add vips-dev

RUN apk add --update alpine-sdk

# Create app directory
WORKDIR /usr/src/app


# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# final base used for delivery
FROM node:20-alpine3.20 AS final

# Create app directory
WORKDIR /usr/src/app

# install global libvips
RUN apk update && \
    apk add vips && \
    apk add vips-jxl && \
    apk add vips-tools && \
    apk add vips-cpp 

# Copy over the files from the build container src
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=builder /usr/src/app/index.js ./index.js

# run index.js
EXPOSE 8080
CMD [ "node", "index.js" ]
