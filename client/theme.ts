// v0.5.0: Paseo's own design tokens, copied so jev's UI reads as native chrome. Numbers mirror
// packages/app/src/styles/theme.ts and components/ui/control-geometry.ts (spacing, radii, type,
// icon sizes, control heights). Keep in sync if Paseo retunes them.
export const space = { 1: 4, 1.5: 6, 2: 8, 3: 12, 4: 16, 6: 24 } as const;
export const radius = { md: 6, lg: 8, full: 9999 } as const;
export const font = { sm: 12, base: 14, lg: 16, xl: 18 } as const;
export const weight = { medium: "500" as const, semibold: "600" as const, bold: "bold" as const };
export const iconSize = { xs: 12, sm: 14, md: 16, lg: 20 } as const;
export const controlHeight = { tight: 28, compact: 32, field: 44 } as const;
