export declare const PREINSTALLED_CHROMIUM: string;

export interface BundledChromium {
  ready: boolean;
  executable: string | null;
  headlessShell: string | null;
  reason: string | null;
}

export interface ResolvedChromium {
  source: 'bundled' | 'PLAYWRIGHT_CHROMIUM_EXECUTABLE' | 'PLAYWRIGHT_BROWSERS_PATH' | 'preinstalled' | 'missing';
  executablePath: string | undefined;
  bundled: BundledChromium;
}

export declare function bundledChromium(root?: string): BundledChromium;
export declare function resolveChromium(options?: { env?: NodeJS.ProcessEnv; root?: string }): ResolvedChromium;
export declare function nodeModulesInSync(root?: string): { inSync: boolean; reason: string | null };
