export type Forged = { original: string; enhanced: string; added: string[] }

/** A prompt held back while its clarifying questions wait for an answer. */
export type Pending = { original: string; questions: string[] }

declare module 'claude-code' {
  interface PluginState {
    'prompt-forge': { forged: Forged[]; pending: Pending | null }
  }
}
