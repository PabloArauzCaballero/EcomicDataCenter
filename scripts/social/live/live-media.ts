import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { sleep } from '../company/social-browser';
import { MEDIA, ROOT, RUN_DIR, flag, log, option, say, type Json } from './live-run';

/**
 * El proceso de voz y pantalla (`live_media.py`), gobernado por órdenes JSON.
 */

// ----------------------------------------------------------------- medios

export class Media {
  private child: ChildProcessWithoutNullStreams | null = null;

  start(): void {
    if (!MEDIA) return;
    const python = join(homedir(), '.observatorio-social', 'venv', 'Scripts', 'python.exe');
    this.child = spawn(
      python,
      [
        '-I',
        join(ROOT, 'scripts', 'social', 'live', 'live_media.py'),
        '--out',
        RUN_DIR,
        '--model',
        option('model', 'small'),
        '--frame-seconds',
        String(flag('frame-seconds', 10)),
      ],
      { cwd: RUN_DIR },
    );
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (data: string) => {
      for (const line of data.split('\n').filter(Boolean)) {
        try {
          log('media.jsonl', { t: Date.now(), ...(JSON.parse(line) as Json) });
        } catch {
          log('media.jsonl', { t: Date.now(), raw: line.slice(0, 300) });
        }
      }
    });
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (data: string) => {
      if (!/symlink|developer mode|warnings\.warn/iu.test(data))
        log('media.jsonl', { t: Date.now(), stderr: data.slice(0, 300) });
    });
    this.child.on('exit', (code) => {
      say('media-exit', { code });
      this.child = null;
    });
  }

  send(order: Json): void {
    this.child?.stdin.write(`${JSON.stringify(order)}\n`);
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    this.send({ cmd: 'quit' });
    const started = Date.now();
    while (this.child && Date.now() - started < 600_000) await sleep(2_000);
    this.child?.kill();
  }
}
