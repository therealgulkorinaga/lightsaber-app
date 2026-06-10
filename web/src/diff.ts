// Word-level LCS diff, ported from the design (Authoring.jsx).

export type DiffPart = { t: 'same' | 'del' | 'ins'; s: string };

function tokenize(s: string): string[] {
  return s.split(/(\s+)/);
}

export function wordDiff(a: string | null | undefined, b: string | null | undefined): DiffPart[] {
  const A = tokenize(a || '');
  const B = tokenize(b || '');
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ t: 'same', s: A[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ t: 'del', s: A[i] });
      i++;
    } else {
      out.push({ t: 'ins', s: B[j] });
      j++;
    }
  }
  while (i < n) out.push({ t: 'del', s: A[i++] });
  while (j < m) out.push({ t: 'ins', s: B[j++] });
  return out;
}
