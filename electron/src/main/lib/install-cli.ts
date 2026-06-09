import { existsSync, symlinkSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { execSync } from 'node:child_process';
import { app, dialog } from 'electron';

const SYMLINK_TARGETS: Record<string, string> = {
  darwin: '/usr/local/bin/jaw',
  linux: join(homedir(), '.local', 'bin', 'jaw'),
};

function getSidecarJawPath(): string | null {
  const jawBin = join(
    process.resourcesPath,
    'server', 'bin',
    platform() === 'win32' ? 'jaw.cmd' : 'jaw',
  );
  return existsSync(jawBin) ? jawBin : null;
}

export function isCliInstalled(): boolean {
  const target = SYMLINK_TARGETS[platform()];
  if (!target) return false;
  return existsSync(target);
}

export async function installCli(): Promise<{ ok: boolean; message: string }> {
  const jawPath = getSidecarJawPath();
  if (!jawPath) return { ok: false, message: 'Sidecar not found in app bundle' };

  const plat = platform();

  if (plat === 'darwin') {
    const target = SYMLINK_TARGETS.darwin!;
    try {
      const escaped = (s: string) => s.replace(/"/g, '\\"');
      execSync(
        `osascript -e 'do shell script "ln -sf \\"${escaped(jawPath)}\\" \\"${escaped(target)}\\"" with administrator privileges'`,
      );
      return { ok: true, message: `Installed: ${target}\nYou can now run "jaw" in any terminal.` };
    } catch {
      return { ok: false, message: 'Admin permission denied or cancelled' };
    }
  }

  if (plat === 'linux') {
    const target = SYMLINK_TARGETS.linux!;
    const dir = join(homedir(), '.local', 'bin');
    try {
      mkdirSync(dir, { recursive: true });
      if (existsSync(target)) unlinkSync(target);
      symlinkSync(jawPath, target);
      return {
        ok: true,
        message: `Installed: ${target}\nMake sure ~/.local/bin is in your PATH.`,
      };
    } catch (err) {
      return { ok: false, message: `Failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  if (plat === 'win32') {
    return { ok: true, message: 'CLI is available via the installer PATH entry.' };
  }

  return { ok: false, message: `Unsupported platform: ${plat}` };
}

export async function promptInstallCli(): Promise<void> {
  if (!app.isPackaged) return;
  if (isCliInstalled()) return;
  if (!getSidecarJawPath()) return;

  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Install', 'Skip'],
    defaultId: 0,
    title: 'Install CLI Command',
    message: 'Install "jaw" command to your terminal?',
    detail: 'This creates a symlink so you can run "jaw" from any terminal window. You can always install it later from the tray menu.',
  });

  if (response === 0) {
    const result = await installCli();
    await dialog.showMessageBox({
      type: result.ok ? 'info' : 'error',
      message: result.ok ? 'CLI Installed' : 'Installation Failed',
      detail: result.message,
    });
  }
}
