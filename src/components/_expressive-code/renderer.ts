import { ExpressiveCode } from 'expressive-code'

let renderer: { ec: ExpressiveCode; tabWidth?: number; getBlockLocale?: () => string } | null = null

export async function getRenderer() {
  if (renderer) return renderer

  const themes = ['github-light', 'github-dark']
  
  const ec = new ExpressiveCode({
    themes,
    styleOverrides: {
      codeFontSize: '0.875rem',
      codeFontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', 'Fira Code Variable', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      codeLineHeight: '1.7142857em',
      borderRadius: '0.5rem',
      frameBorderWidth: '1px',
      frameShadow: '0 2px 12px rgba(0, 0, 0, 0.1)',
      containerPaddingBlock: '0.75rem',
      containerPaddingInline: '1rem',
      lineNumberMarginInline: '1rem',
      lineNumberWidth: '2rem',
    },
    frames: {
      showCopyButton: true,
      showLanguageBadge: true,
      headingFontSize: '0.75rem',
      headingFontWeight: 600,
      headingTextTransform: 'uppercase',
      headingLetterSpacing: '0.05em',
    },
    useDarkModeMediaQuery: false,
    themeCssSelector: (theme) => {
      if (theme.name === 'github-dark') return '.dark'
      return false
    },
  })

  await ec.init()

  renderer = {
    ec,
    tabWidth: 2,
  }

  return renderer
}
