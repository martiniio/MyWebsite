import type { AstroGlobal } from 'astro'

interface PageData {
  blockGroupIndex: number
}

const pageDataMap = new Map<string, PageData>()

export function getPageData(request: AstroGlobal['request']): PageData {
  const url = request.url
  let pageData = pageDataMap.get(url)
  
  if (!pageData) {
    pageData = { blockGroupIndex: 0 }
    pageDataMap.set(url, pageData)
  }
  
  return pageData
}
