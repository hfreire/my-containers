# syntax=docker/dockerfile:1

variable "VERSION" {
  // renovate: datasource=github-releases depName=excalidraw/excalidraw-mcp extractVersion=^v(?<version>.*)$
  default = "0.3.2"
}

variable "REGISTRY" {
  default = "zot.k8s1.se.home"
}

variable "APP" {
  default = "excalidraw-mcp"
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
    "${REGISTRY}/${APP}:${VERSION}",
    "${REGISTRY}/${APP}:latest",
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
