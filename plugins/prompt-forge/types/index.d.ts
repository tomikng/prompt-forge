/** The Superset workspace a session runs in. */
export type Workspace = { id: string; name: string; projectId: string }

/** A prompt held as a new task while the fresh-start offer waits. */
export type Fresh = { text: string; tokens: number; topic: 'related' | 'unrelated'; ws: Workspace | null; repo: string | null }

declare module 'claude-code' {
  interface PluginState {
    'prompt-forge': { fresh: Fresh | null }
  }
}
