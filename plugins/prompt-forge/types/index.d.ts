export type Forged = { original: string; enhanced: string; added: string[] }

declare module 'claude-code' {
  interface PluginState {
    'prompt-forge': { forged: Forged[] }
  }
}
