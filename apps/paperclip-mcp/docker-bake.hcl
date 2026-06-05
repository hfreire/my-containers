variable "VERSION" {
  // renovate: datasource=pypi depName=paperclip-mcp
  default = "0.1.0"
}

variable "REGISTRY" {
  default = "zot.k8s1.se.home"
}

variable "APP" {
  default = "paperclip-mcp"
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
  # Pure-Python package: build both arches so the workload can schedule on any
  # node (Pi 5 arm64 or the lone amd64 node).
  platforms = ["linux/amd64", "linux/arm64"]
}

target "image-local" {
  inherits = ["image"]
  output   = ["type=docker"]
}
