.PHONY: deploy-prod

# Cluster and infrastructure operations live in the GitOps repo:
#   https://github.com/SC-Starcapital/gitops-brain-infra
# That repo's Makefile has kubeconfig-*, cluster-bootstrap, secrets-*, apply-*,
# and the ArgoCD Application targets. Nothing in this repo touches a cluster.

# Tag and push a production release. Pushing a `v*` tag triggers
# .github/workflows/deploy-prod.yml, which builds the image and commits the new
# SHA into the GitOps repo; ArgoCD rolls it out from there.
# Usage: make deploy-prod   (prompts for patch / minor / major)
deploy-prod:
	@git pull
	@LAST_TAG=$$(git tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$$' | head -1); \
	if [ -z "$$LAST_TAG" ]; then LAST_TAG="v0.0.0"; fi; \
	MAJOR=$$(echo $$LAST_TAG | sed 's/^v//' | cut -d. -f1); \
	MINOR=$$(echo $$LAST_TAG | sed 's/^v//' | cut -d. -f2); \
	PATCH=$$(echo $$LAST_TAG | sed 's/^v//' | cut -d. -f3); \
	echo "Current tag: $$LAST_TAG"; \
	echo "Bump type? [patch/minor/major]:"; \
	read BUMP; \
	case "$$BUMP" in \
		patch) PATCH=$$((PATCH + 1)) ;; \
		minor) MINOR=$$((MINOR + 1)); PATCH=0 ;; \
		major) MAJOR=$$((MAJOR + 1)); MINOR=0; PATCH=0 ;; \
		*) echo "Invalid bump type: $$BUMP (expected patch, minor, or major)"; exit 1 ;; \
	esac; \
	NEW_TAG="v$$MAJOR.$$MINOR.$$PATCH"; \
	TARGET_COMMIT=$$(git rev-parse --short HEAD); \
	echo "Tagging commit $$TARGET_COMMIT as $$NEW_TAG"; \
	git tag "$$NEW_TAG" "$$TARGET_COMMIT"; \
	git push origin "$$NEW_TAG"; \
	echo "Released $$NEW_TAG"
