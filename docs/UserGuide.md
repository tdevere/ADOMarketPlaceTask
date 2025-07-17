# User Guide

## Using the Troubleshooter Task

The Troubleshooter task runs network diagnostics when preceding pipeline tasks fail.

### Available Tests:
- `ping`: Check connectivity
- `dns`: DNS resolution tests
- `trace`: Trace route diagnostics
- `https`: HTTPS endpoint check
- `custom`: Run custom scripts provided inline

### Example Usage in Pipeline

```yaml
- task: TroubleshooterTask@0
  condition: failed()
  inputs:
    endpoint: "api.example.com"
    tests: |
      ping
      trace
      https
    captureNetworkTrace: true
```

### Optional Settings:

* **Capture Network Trace**: Generates packet captures for troubleshooting.
* **Upload Output as Artifact**: Stores test results as artifacts in Azure DevOps.


---

## 🎯 Local Development (Windows 11 + VS Code):

### Prerequisites:
- Install [Node.js LTS](https://nodejs.org/en).
- Install Azure DevOps CLI extension (`tfx`):
```bash
npm install -g tfx-cli
````

### Debugging locally:

* Open project in VS Code.
* Edit task scripts under `src`.
* Run the packaging and upload commands as documented in Admin Guide.

### Validating Task:

* Create a test Azure DevOps pipeline.
* Include your custom task and verify successful deployment.
