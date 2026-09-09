// Original geometric outlines shared by the extruded meshes and no-WebGL fallback.
export const PLATFORM_GLYPHS = [
  "M5 5 Q24 0 38 0 C61 0 73 11 73 28 C73 39 67 46 58 49 C69 53 77 60 77 73 C77 92 62 100 39 100 Q19 100 3 92 L8 73 Q23 82 37 82 C49 82 54 78 54 71 C54 64 48 60 36 60 L23 60 L23 41 L36 41 C46 41 51 37 51 30 C51 23 46 19 36 19 Q22 19 10 25 Z",
  "M94 1 L126 1 C158 1 173 18 173 50 C173 82 158 99 126 99 L94 99 Z M116 21 L116 79 L125 79 C142 79 150 69 150 50 C150 31 142 21 125 21 Z"
] as const;

// Keep in sync with the CSS media query. Square viewports remain unchanged.
export const PLATFORM_MEDIA = "(min-width: 901px) and (orientation: landscape)";
