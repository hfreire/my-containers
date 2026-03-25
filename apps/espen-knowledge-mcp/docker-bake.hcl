// renovate: datasource=github-tags depName=hfreire/espen-knowledge-mcp
variable "VERSION" {
  default = "0.1.0"
}

variable "REGISTRY" {
  default = "ghcr.io/hfreire"
}

group "default" {
  targets = ["image"]
}

target "image" {
  context    = "apps/espen-knowledge-mcp"
  dockerfile = "Dockerfile"
  args = {
    VERSION = VERSION
  }
  tags = [
    "${REGISTRY}/espen-knowledge-mcp:${VERSION}",
    "${REGISTRY}/espen-knowledge-mcp:rolling",
  ]
  labels = {
    "org.opencontainers.image.source"  = "https://github.com/hfreire/my-containers"
    "org.opencontainers.image.version" = VERSION
  }
  platforms = [
    "linux/amd64",
    "linux/arm64",
  ]
}

target "image-local" {
  inherits = ["image"]
  output   = ["type=docker"]
}
