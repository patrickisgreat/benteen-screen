export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      neutral: 'slate'
    },
    // Design-system control sizing (consistent + touch-friendly on mobile).
    // Form controls are `lg` (~40px tap target); buttons default `md`, with
    // primary CTAs opting up to `lg` and inline icon actions to `sm` per use.
    input: { defaultVariants: { size: 'lg' } },
    textarea: { defaultVariants: { size: 'lg' } },
    select: { defaultVariants: { size: 'lg' } },
    selectMenu: { defaultVariants: { size: 'lg' } },
    inputMenu: { defaultVariants: { size: 'lg' } },
    button: { defaultVariants: { size: 'md' } }
  }
})
