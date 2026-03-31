import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type SimpleGit, simpleGit } from 'simple-git';

export class GitManager {
  private git: SimpleGit;
  private repoDir: string;

  constructor(repoDir: string) {
    this.repoDir = repoDir;
    this.git = simpleGit(repoDir);
  }

  async init(): Promise<void> {
    if (!existsSync(join(this.repoDir, '.git'))) {
      await this.git.init();
      await this.git.addConfig('user.name', 'clawtique');
      await this.git.addConfig('user.email', 'noreply@clawtique.dev');
    }
  }

  async isRepo(): Promise<boolean> {
    return existsSync(join(this.repoDir, '.git'));
  }

  /** Record the current HEAD for rollback. */
  async snapshot(): Promise<string | null> {
    try {
      return await this.git.revparse(['HEAD']);
    } catch {
      return null; // No commits yet
    }
  }

  /** Commit all changes with a conventional commit message. */
  async commit(
    type: 'feat' | 'refactor' | 'revert' | 'fix',
    scope: string,
    subject: string,
    body?: string,
  ): Promise<string> {
    await this.git.add('-A');

    const status = await this.git.status();
    if (status.isClean()) {
      return ''; // Nothing to commit
    }

    let message = `${type}(${scope}): ${subject}`;
    if (body) {
      message += `\n\n${body}`;
    }

    const result = await this.git.commit(message);
    return result.commit;
  }

  /** Roll back to a previously recorded snapshot. */
  async rollback(snapshotSha: string): Promise<void> {
    await this.git.reset(['--hard', snapshotSha]);
  }

  /** Get recent log entries. */
  async log(count: number = 20): Promise<
    Array<{
      hash: string;
      date: string;
      message: string;
    }>
  > {
    try {
      const log = await this.git.log({ maxCount: count });
      return log.all.map((entry) => ({
        hash: entry.hash.slice(0, 8),
        date: entry.date,
        message: entry.message,
      }));
    } catch {
      return [];
    }
  }

  /** Get the last commit message. */
  async lastCommit(): Promise<{ hash: string; message: string } | null> {
    try {
      const log = await this.git.log({ maxCount: 1 });
      if (log.all.length === 0) return null;
      return {
        hash: log.all[0]!.hash,
        message: log.all[0]!.message,
      };
    } catch {
      return null;
    }
  }
}
