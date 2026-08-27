# Build base used for global libvips and native compilation
FROM node:20-alpine3.20 AS builder

# Install libvips and build tools for JPEG XL and Sharp
RUN apk update && \
    apk add --no-cache \
    vips \
    vips-jxl \
    vips-tools \
    vips-cpp \
    vips-dev \
    alpine-sdk

# Create app directory
WORKDIR /usr/src/app

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Bundle app source
COPY . .

# Final base image used for deployment
FROM node:20-alpine3.20 AS final

# Create app directory
WORKDIR /usr/src/app

# Install runtime libvips libraries
RUN apk update && \
    apk add --no-cache \
    vips \
    vips-jxl \
    vips-tools \
    vips-cpp

# Copy application and production dependencies from builder
COPY --from=builder /usr/src/app ./

# Expose port and run server
EXPOSE 8080
CMD [ "node", "index.js" ]
