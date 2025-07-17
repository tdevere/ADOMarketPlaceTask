# Administrator Guide

## Installing the Task

1. Clone this repository:
```bash
git clone https://github.com/YourRepo/ADO-Troubleshooter-Task.git
````

2. Install Azure DevOps extension tools:

```bash
npm install -g tfx-cli
```

3. Build and upload to Azure DevOps:

```bash
tfx build tasks upload --task-path ./src
```

4. Verify the task in Azure DevOps:

* Navigate to your organization settings > Extensions > Installed Extensions.

## Configuring Azure Pipelines

Use the task in pipeline YAML after a dependent task:

```yaml
- task: TroubleshooterTask@0
  condition: failed()
  inputs:
    endpoint: "api.example.com"
    tests: |
      ping
      dns
    captureNetworkTrace: true
    uploadOutput: true
```


