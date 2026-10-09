export type Forged = { original: string; enhanced: string; added: string[] }

/** A prompt held back while its clarifying questions wait for an answer. */
export type Pending = { original: string; questions: string[] }

/** A prompt held as a new, unrelated task while the fresh-start offer waits. */
export type Fresh = { text: string; tokens: number }

declare module 'claude-code' {
  interface PluginState {
    'prompt-forge': { forged: Forged[]; pending: Pending | null; fresh: Fresh | null }
  }
}
