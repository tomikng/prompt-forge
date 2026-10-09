/** A prompt held as a new, unrelated task while the fresh-start offer waits. */
export type Fresh = { text: string; tokens: number }

declare module 'claude-code' {
  interface PluginState {
    'prompt-forge': { fresh: Fresh | null }
  }
}
