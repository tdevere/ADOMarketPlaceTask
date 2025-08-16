const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const util = require('util');
const tl = require('azure-pipelines-task-lib/task');
const execFile = util.promisify(cp.execFile);
const exec = util.promisify(cp.exec);
const zlib = require('zlib');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);

function sanitize(text) {
  if (!text) return text;
  // basic heuristics: mask long hex/token-like strings and auth headers
  return text.replace(/([A-Za-z0-9_\-]{20,})/g, '<<REDACTED>>')
    .replace(/(Authorization:\s*)([^\r\n]+)/ig, '$1<<REDACTED>>');
}

function writeFile(filePath, data, sanitizeOutputs) {
  const out = sanitizeOutputs && typeof data === 'string' ? sanitize(data) : data;
  fs.writeFileSync(filePath, typeof out === 'string' ? out : JSON.stringify(out, null, 2), { encoding: 'utf8' });
}

async function runTool(cmd, args, opts, timeoutSeconds) {
  const timeout = (timeoutSeconds || 30) * 1000;
  try {
    const options = Object.assign({}, opts || {}, { timeout });
    const { stdout, stderr } = await execFile(cmd, args || [], options);
    return { stdout, stderr };
  } catch (err) {
    if (err.killed || err.signal === 'SIGTERM') {
      return { error: `Timed out after ${timeoutSeconds}s` };
    }
    return { error: err.message || String(err), code: err.code };
  }
}

function findExecutable(names) {
  for (const n of names) {
    try {
      if (os.platform() === 'win32') {
        const where = cp.execSync(`where ${n}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        if (where && where.trim()) return n;
      } else {
        const which = cp.execSync(`which ${n}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        if (which && which.trim()) return n;
      }
    } catch (e) {
      // not found
    }
  }
  return null;
}

async function zipDirectory(sourceDir, outPath) {
  // Simple zip using powershell on windows or zip on unix if available, fallback to tar.gz
  if (os.platform() === 'win32') {
    // prefer powershell Compress-Archive if available
    try {
      await execFile('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${outPath}' -Force`], { timeout: 120000 });
      return;
    } catch (e) {
      // fallback
    }
  } else {
    try {
      await execFile('zip', ['-r', outPath, '.'], { cwd: sourceDir, timeout: 120000 });
      return;
    } catch (e) {
      // fallback to tar
    }
  }
  // fallback to tar.gz
  const tarPath = outPath.endsWith('.zip') ? outPath.replace(/\.zip$/i, '.tar.gz') : outPath + '.tar.gz';
  await execFile('tar', ['-czf', tarPath, '-C', sourceDir, '.']);
}

async function run() {
  try {
    const target = tl.getInput('target', true);
    const toolsRaw = tl.getInput('tools', false) || '';
    const captureNetworkTrace = tl.getBoolInput('captureNetworkTrace', false);
    const customScript = tl.getInput('customScript', false) || '';
    const sanitizeOutputs = tl.getBoolInput('sanitizeOutputs', false);
    const archiveArtifacts = tl.getBoolInput('archiveArtifacts', true);
    const artifactName = tl.getInput('artifactName', false) || 'network-troubleshoot';
    const timeoutSeconds = parseInt(tl.getInput('timeoutSeconds', false) || '30', 10) || 30;
    const retries = parseInt(tl.getInput('retries', false) || '0', 10) || 0;

    const tools = toolsRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    const outDir = path.join(tl.getVariable('Agent.TempDirectory') || process.cwd(), 'network-troubleshoot');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const report = { runAt: new Date().toISOString(), target, platform: process.platform, results: [] };

    // Helper for retries
    async function attempt(name, fn) {
      let lastErr;
      for (let i = 0; i <= retries; i++) {
        const attemptIndex = i + 1;
        tl.debug(`Attempt ${attemptIndex}/${retries + 1} for ${name}`);
        try {
          const res = await fn();
          return res;
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    }

    for (const tool of tools) {
      const entry = { tool, startedAt: new Date().toISOString() };
      let toolOut = null;
      const fname = path.join(outDir, `${tool.replace(/[^a-z0-9]/gi,'_')}.log`);

      try {
        if (tool.toLowerCase() === 'ping') {
          const cmd = process.platform === 'win32' ? 'ping' : 'ping';
          const args = process.platform === 'win32' ? [target] : ['-c', '4', target];
          toolOut = await attempt('ping', () => runTool(cmd, args, {}, timeoutSeconds));
        } else if (tool.toLowerCase() === 'dns') {
          const cmd = process.platform === 'win32' ? (findExecutable(['nslookup']) || 'nslookup') : (findExecutable(['dig','nslookup']) || 'dig');
          const args = process.platform === 'win32' ? [target] : [target];
          toolOut = await attempt('dns', () => runTool(cmd, args, {}, timeoutSeconds));
        } else if (tool.toLowerCase() === 'traceroute') {
          const cmd = process.platform === 'win32' ? 'tracert' : (findExecutable(['traceroute','tracepath']) || 'traceroute');
          const args = process.platform === 'win32' ? [target] : [target];
          toolOut = await attempt('traceroute', () => runTool(cmd, args, {}, timeoutSeconds));
  } else if (tool.toLowerCase() === 'https') {
          if (process.platform === 'win32') {
            toolOut = await attempt('https', () => runTool('powershell', ['-NoProfile','-Command', `try { (Invoke-WebRequest -Uri \"https://${target}\" -UseBasicParsing -Method Head -TimeoutSec ${timeoutSeconds}).StatusCode } catch { $_.Exception.Message }`], {}, timeoutSeconds));
          } else {
            const curl = findExecutable(['curl']);
            const args = curl ? ['-I','--max-time', String(timeoutSeconds), `https://${target}`] : ['-I', `https://${target}`];
            const cmd = curl || 'curl';
            toolOut = await attempt('https', () => runTool(cmd, args, {}, timeoutSeconds));
          }
        } else if (tool.toLowerCase() === 'netstat') {
          const cmd = process.platform === 'win32' ? 'netstat' : (findExecutable(['ss','netstat']) || 'netstat');
          const args = process.platform === 'win32' ? ['-an'] : ['-an'];
          toolOut = await attempt('netstat', () => runTool(cmd, args, {}, timeoutSeconds));
  } else if (tool.toLowerCase() === 'ifconfig' || tool.toLowerCase() === 'ipconfig') {
          if (process.platform === 'win32') {
            toolOut = await attempt('ipconfig', () => runTool('ipconfig', ['/all'], {}, timeoutSeconds));
          } else {
            const cmd = findExecutable(['ifconfig','ip']) || 'ifconfig';
            const args = cmd === 'ip' ? ['addr'] : [];
            toolOut = await attempt('ifconfig', () => runTool(cmd, args, {}, timeoutSeconds));
          }
        } else if (tool.toLowerCase() === 'script') {
          if (!customScript) {
            toolOut = { error: 'No custom script provided' };
          } else {
            const scriptFile = path.join(outDir, `custom-script.${process.platform === 'win32' ? 'ps1' : 'sh'}`);
            fs.writeFileSync(scriptFile, customScript, { encoding: 'utf8' });
            if (process.platform !== 'win32') fs.chmodSync(scriptFile, 0o755);
            const cmd = process.platform === 'win32' ? 'powershell' : scriptFile;
            const args = process.platform === 'win32' ? ['-NoProfile','-ExecutionPolicy','Bypass','-File',scriptFile] : [];
            toolOut = await attempt('script', () => runTool(cmd, args, {}, timeoutSeconds));
          }
        } else {
          toolOut = { error: `Unknown tool: ${tool}` };
        }

        // additional helpers
        if (!toolOut || (toolOut && toolOut.error && tool.toLowerCase() === 'test-netconnection')) {
          // noop - reserved
        }

        writeFile(fname, toolOut.stdout || toolOut.stderr || JSON.stringify(toolOut), sanitizeOutputs);
        entry.result = toolOut;
      } catch (err) {
        entry.result = { error: err && err.message ? err.message : String(err) };
        writeFile(fname, entry.result.error || String(entry.result), sanitizeOutputs);
      }
      entry.finishedAt = new Date().toISOString();
      report.results.push(entry);
    }

    if (captureNetworkTrace) {
      // Best-effort capture: try tcpdump/tshark or netsh trace on windows
      const traceEntry = { tool: 'network-trace', startedAt: new Date().toISOString() };
      try {
        if (process.platform === 'win32') {
          // check for netsh
          const netsh = findExecutable(['netsh']);
          if (netsh) {
            const traceFile = path.join(outDir, 'netsh-nettrace-etl');
            // create an administrative trace requires elevation; do not attempt elevation automatically
            traceEntry.info = 'netsh available but capturing requires elevated permissions; not started automatically';
          } else {
            traceEntry.info = 'netsh not available on agent';
          }
        } else {
          const tcpdump = findExecutable(['tcpdump']);
          if (tcpdump) {
            traceEntry.info = 'tcpdump available but capture not started: requires explicit opt-in; future work';
          } else {
            traceEntry.info = 'tcpdump not available on agent';
          }
        }
      } catch (err) {
        traceEntry.error = String(err);
      }
      traceEntry.finishedAt = new Date().toISOString();
      report.results.push(traceEntry);
    }

    const reportFile = path.join(outDir, 'report.json');
    writeFile(reportFile, report, sanitizeOutputs);

    // human-friendly summary
    const summary = [`Network Troubleshoot summary for target: ${target}`, `Run at: ${report.runAt}`, `Platform: ${report.platform}`, '', 'Results:'];
    for (const r of report.results) {
      summary.push(`- ${r.tool}: ${r.result && r.result.error ? 'ERROR: ' + r.result.error : 'OK'}`);
    }
    const summaryFile = path.join(outDir, 'summary.txt');
    writeFile(summaryFile, summary.join('\n'), sanitizeOutputs);

    if (archiveArtifacts) {
      const artifactPath = tl.getVariable('Build.ArtifactStagingDirectory') || tl.getVariable('Agent.TempDirectory') || outDir;
      const dest = path.join(artifactPath, artifactName);
      tl.mkdirP(dest);
      tl.cp(outDir, dest, '-R');
      // create a timestamped zip in artifact staging
      const ts = new Date().toISOString().replace(/[:\.]/g, '-');
      const zipFile = path.join(artifactPath, `${artifactName}-${ts}.zip`);
      await zipDirectory(dest, zipFile);
      tl.debug(`Saved and archived network troubleshoot outputs to ${zipFile}`);
    } else if (tl.getBoolInput('saveArtifacts', false)) {
      const artifactPath = tl.getVariable('Build.ArtifactStagingDirectory') || tl.getVariable('Agent.TempDirectory') || outDir;
      const dest = path.join(artifactPath, artifactName);
      tl.mkdirP(dest);
      tl.cp(outDir, dest, '-R');
      tl.debug(`Saved network troubleshoot outputs to ${dest}`);
    }

    tl.setResult(tl.TaskResult.Succeeded, 'Network troubleshooting completed');
  } catch (err) {
    tl.setResult(tl.TaskResult.Failed, `Task failed: ${err && err.message ? err.message : err}`);
  }
}

run();
