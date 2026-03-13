# syntax=docker/dockerfile:1

variable "VERSION" {
  // renovate: datasource=npm depName=mcp-node-red
  default = "1.1.0"
}

variable "REGISTRY" {
  default = "ghcr.io"
}

variable "OWNER" {
  default = "hfreire"
}

variable "APP" {
  default = "node-red-mcp"
}

variable "SOURCE" {
  default = "https://github.com/hfreire/my-containers"
}

group "default" {
  targets = ["image"]
}

target "image" {
  dockerfile = "Dockerfile"
  context    = "."
  args = {
    VERSION = VERSION
  }
  tags = [
    "${REGISTRY}/${OWNER}/${APP}:${VERSION}",
    "${REGISTRY}/${OWNER}/${APP}:rolling",
  ]
  labels = {
    "org.opencontainers.image.source"  = SOURCE
    "org.opencontainers.image.version" = VERSION
    "org.opencontainers.image.title"   = APP
  }
  platforms = ["linux/amd64", "linux/arm64"]
}

target "image-local" {
  inherits = ["image"]
  output   = ["type=docker"]
}
