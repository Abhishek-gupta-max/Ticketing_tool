// Client-side validation mirrors the server rules for fast feedback. The
// server validates everything again; these checks are only a convenience.
export const isEmail = (v) => /^\S+@\S+\.\S+$/.test(String(v || '').trim());

export function passwordProblem(pw) {
  if (!pw || pw.length < 10) return 'Use at least 10 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use at least one letter and one number.';
  return null;
}

export const minLength = (v, n) => String(v || '').trim().length >= n;

/** Check files against the limits the server publishes in /meta. */
export function fileProblem(file, limits) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (limits?.blocked?.includes(ext)) return `${file.name}: .${ext} files are not allowed.`;
  if (file.size === 0) return `${file.name}: the file is empty.`;
  if (limits && file.size > limits.maxBytes) return `${file.name}: larger than ${Math.round(limits.maxBytes / 1048576)} MB.`;
  if (limits?.allowed && !limits.allowed.includes(ext)) return `${file.name}: .${ext} files are not accepted.`;
  return null;
}
