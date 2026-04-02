/**
 * In-memory store for active Browser Use sessions.
 * Allows follow-up tasks and cleanup across tool invocations.
 */

export type ActiveSession = {
  sessionId: string;
  liveUrl: string;
  createdAt: string;
  lastTaskOutput: string | null;
};

const sessions = new Map<string, ActiveSession>();

export function getSession(sessionId: string): ActiveSession | undefined {
  return sessions.get(sessionId);
}

export function setSession(session: ActiveSession): void {
  sessions.set(session.sessionId, session);
}

export function removeSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function listSessions(): ActiveSession[] {
  return Array.from(sessions.values());
}
