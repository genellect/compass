const githubProfileUrl = "https://github.com/genellect";

export function GitHubProfileLink({ className = "", label = "GitHub Portfolio" }: { className?: string; label?: string }) {
  return (
    <a
      className={["github-profile-link", className].filter(Boolean).join(" ")}
      href={githubProfileUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Yuto MatsuiのGitHubポートフォリオを新しいタブで開く"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M8 0C3.58 0 0 3.64 0 8.13c0 3.59 2.29 6.64 5.47 7.72.4.08.55-.18.55-.39 0-.19-.01-.83-.01-1.51-2.23.49-2.69-.55-2.69-.55-.36-.94-.89-1.19-.89-1.19-.73-.5.05-.49.05-.49.8.06 1.22.83 1.22.83.71 1.23 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.21-3.64-.91-3.64-4.02 0-.89.31-1.62.82-2.19-.08-.21-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.5 7.5 0 0 1 8 4.61a7.5 7.5 0 0 1 2 .27c1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.95.08 2.16.51.57.82 1.3.82 2.19 0 3.12-1.87 3.81-3.65 4.01.29.25.54.74.54 1.5 0 1.08-.01 1.95-.01 2.22 0 .21.15.47.55.39A8.05 8.05 0 0 0 16 8.13C16 3.64 12.42 0 8 0Z" />
      </svg>
      <span>
        <strong>{label}</strong>
      </span>
      <i aria-hidden="true">↗</i>
    </a>
  );
}
