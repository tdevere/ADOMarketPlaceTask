# Network Troubleshoot Task (preview)

This task runs common network diagnostic tools on the build agent and collects the outputs for troubleshooting.

Practical defaults (recommended for v1):
- Platforms: Windows (win32) and Linux (Ubuntu). macOS support is partial.
- Tools included in v1: ping, dns, traceroute, https, netstat, ipconfig/ifconfig, custom script
- Per-tool timeout: 30s (configurable)
- Retries: 0 (configurable)
- Outputs: saved to artifact staging under `network-troubleshoot` and archived to `network-troubleshoot.zip` by default
- Sanitization: enabled by default (basic heuristics to redact tokens/authorization headers)

Artifact layout (artifact folder / zip):
- report.json (machine readable results)
- summary.txt (human readable summary)
- <tool>.log (per-tool output)
- custom-script.ps1|sh (if provided)

Trace capture and permissions
- Packet-level trace capture (tcpdump/tshark, netsh trace) is not started automatically. The task detects availability but will not attempt elevation. Use explicit elevated steps to capture traces.

Configuration recommendations
- For routine network checks, keep `captureNetworkTrace` false and run ping/dns/traceroute/netstat.
- For support requests, enable `archiveArtifacts` and provide a descriptive `artifactName` so outputs are easy to find.

Privacy and sanitization
- By default outputs are run through a basic sanitizer. If you need raw outputs for deep debugging, disable `sanitizeOutputs` and ensure you have explicit consent before sharing artifacts.

Next work (planned)
- Improved sanitization using configurable patterns
- Add Test-NetConnection support on Windows
- Add optional elevated trace capture helper with explicit consent and safety checks
- Add unit tests, smoke tests, and Marketplace packaging artifacts

Usage
- Add the task to a pipeline, provide a `target`, set `tools` (one per line), and tune `timeoutSeconds` and `retries` as needed.

Example tools list:
ping
dns
traceroute
https
netstat
ifconfig
script

Notes
- The Node runner depends on `azure-pipelines-task-lib` and will be packaged during build.
