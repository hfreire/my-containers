# my-containers

Container images built with podman and pushed to a self-hosted Zot registry.

## Registry

- URL: `zot.k8s1.se.home`
- TLS: self-signed certificate, requires `--tls-verify=false` for podman/skopeo

## Build

```bash
cd apps/<app>
podman build --build-arg VERSION=<version> -t zot.k8s1.se.home/<app>:<version> -t zot.k8s1.se.home/<app>:latest .
```

## Push

```bash
podman push --tls-verify=false zot.k8s1.se.home/<app>:<version>
podman push --tls-verify=false zot.k8s1.se.home/<app>:latest
```

## Inspect and fetch digest

```bash
skopeo inspect --tls-verify=false docker://zot.k8s1.se.home/<app>:<tag>
```

The `Digest` field in the output contains the image digest (e.g., `sha256:...`).

## Tools

- Use `podman` (not docker) for building and pushing
- Use `skopeo inspect` (not podman inspect) to inspect remote images
