# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-04-29

### Added

- Added service creation from the app, including plist validation and helper snippets.
- Added service folders, tree navigation, drag-and-drop organization, and folder-level actions.
- Added embedded terminal and Ghostty launch support for service and log sessions.
- Added usage-based sorting and background usage polling for launchd services.
- Added bundled Ghostty resources for release packaging.

### Changed

- Isolated live usage refreshes so background polling updates only the usage metrics component instead of replacing the full service roster UI.
- Split display aliases from service folder organization while migrating legacy alias paths.
- Improved tray icon rendering with SVG and PNG fallbacks.

### Fixed

- Corrected virtual memory unit conversion for process snapshots.
- Guarded terminal input and resize handling after embedded sessions exit.
