# syntax=docker/dockerfile:1

variable "VERSION" {
  // wint-mcp has no tags/releases — pin to commit SHA. Renovate watches
  // git-refs on the upstream main branch and bumps this.
  // renovate: datasource=git-refs depName=https://github.com/iggerask/wint-mcp branch=main
  default = "1cb90354b3481b5dbaf9a4f9d665a3708978bcbb"
}

variable "REGISTRY" {
  default = "zot.k8s1.se.home"
}

variable "APP" {
  default = "wint-mcp"
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
  # arm64-only: cluster is mostly Pi 5 (arm64); qem1 is the lone amd64 node.
  # Building amd64 on Apple Silicon requires QEMU emulation, which hangs npm
  # ci. The MCPServer pins nodeSelector arch=arm64 to match.
  platforms = ["linux/arm64"]
}

target "image-local" {
  inherits = ["image"]
  output   = ["type=docker"]
}
