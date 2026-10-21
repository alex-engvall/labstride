# Labstride

**Open workflows. Your tools.**

Labstride is a planned, self-hosted foundation for development workspaces and workflows. Connect an issue field to an action, prepare an isolated workspace, run your existing CI/deploy workflow, and report the result where you work.

**Status: specification and implementation backlog. No installable release exists yet.**

The first public release will include a persistent coordinator, CLI, GitHub adapter, SSH connector, GitHub workflow action, and a directory-cleanup action. An agent is optional. Private extensions use the same versioned contracts as public contributions.

The adopted hybrid keeps tasks, human decisions and visible progress in GitHub. A small local coordinator retains execution identity and recovery state; repository-owned Actions build, test and deliver. Optional agent hooks report observations through the coordinator rather than competing to write status. See the [architecture decision](docs/adr/0006-hybrid-coordination.md).

## Principles

- Configure field mappings, values, permissions and workflows per installation.
- Keep application frameworks, hosting providers and control panels outside the core.
- Run deployments through repository-owned GitHub Actions workflows.
- Recover unfinished work after restarts without blindly repeating side effects.
- Give every concurrent issue its own workspace.

Linux is the first intended verified runtime/SSH target. Cross-platform architecture is a goal; additional operating systems require their own execution evidence.

## Read and build

Start with [the documentation index](docs/README.md), [product scope](docs/01-product-and-scope.md), [architecture](docs/06-architecture.md) and [work packages](docs/14-work-packages.md). The [agent guide](docs/AGENT-GUIDE.md) defines the reading and implementation order. [backlog.json](docs/backlog.json) is the source of truth for requirement tracking.

Want to contribute a connector or action? Read [extension contracts](docs/10-extensions.md) and [CONTRIBUTING](CONTRIBUTING.md).

## License and stewardship

Apache-2.0. Commercial use and private extensions are welcome subject to the license. Initial author and maintainer: Alexander Engvall, GitHub alex-engvall. Contributors retain their copyright and contribute under the project's license with DCO sign-off. See [governance](GOVERNANCE.md).
