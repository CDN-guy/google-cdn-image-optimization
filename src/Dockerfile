# build base used for global libvips
FROM node:18-alpine as builder

# install jxl, heif for AVIF, JPEG XL support
RUN apk update && \
    apk add vips && \
    apk add vips-heif && \
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
FROM node:18-alpine as final

# Create app directory
WORKDIR /usr/src/app

# install global libvips
RUN apk update && \
    apk add vips && \
    apk add vips-heif && \
    apk add vips-jxl && \
    apk add vips-tools && \
    apk add vips-cpp 

# Copy over the files from the build container src
#COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json package.json

COPY --from=builder /usr/src/app/ ./

# run index.js
EXPOSE 8080
CMD [ "node", "index.js" ]