// renovate: datasource=github-tags depName=hfreire/aws-iot-core-mcp
variable "VERSION" {
  default = "0.1.0"
}

variable "REGISTRY" {
  default = "ghcr.io/hfreire/my-containers"
}

group "default" {
  targets = ["image"]
}

target "image" {
  context    = "apps/aws-iot-core-mcp"
  dockerfile = "Dockerfile"
  args = {
    VERSION = VERSION
  }
  tags = [
    "${REGISTRY}/aws-iot-core-mcp:${VERSION}",
    "${REGISTRY}/aws-iot-core-mcp:rolling",
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
