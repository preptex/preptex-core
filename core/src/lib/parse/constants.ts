// Shared parse-time constants for sections

export const SECTION_LEVELS: Record<string, number> = {
  section: 1,
  subsection: 2,
  subsubsection: 3,
  paragraph: 4,
  subparagraph: 5,
};

export const SECTION_COMMANDS: Set<string> = new Set(Object.keys(SECTION_LEVELS));
