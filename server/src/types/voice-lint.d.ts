declare module '@lightsaber/voice-lint' {
  export const BANNED_WORDS: string[];
  export const EM_DASH_RE: RegExp;
  export interface LintFinding {
    type: 'em_dash' | 'banned_word';
    word?: string;
    index?: number;
  }
  export function lintText(text: string, opts?: { extraWords?: string[] }): LintFinding[];
  export function lintFields(
    fields: Record<string, string>,
    opts?: { extraWords?: string[] },
  ): { field: string; findings: LintFinding[] }[];
}
