# Azure DevOps Troubleshooter Task Template

This repository provides a ready-to-use Azure DevOps task template for troubleshooting network-related issues during pipeline execution.

## Overview

The task allows users to select and run common troubleshooting tools:

- Ping
- DNS Resolution
- Trace Route
- HTTPS check
- Custom inline script (PowerShell or Bash)

It also supports capturing network traces.

## Setup Requirements

- Windows 11 (Development environment)
- VS Code
- Node.js & npm (Azure DevOps Task SDK)

## Project Structure

See [`docs`](./docs) folder for user and admin documentation.

## Development

Install task SDK:
```bash
npm install -g tfx-cli
