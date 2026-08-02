import { useEffect } from 'react'

/**
 * Set the browser tab title for a screen.
 *
 * index.html carries the marketing title, because that's what a crawler or a
 * link preview reads. Without this hook every admin and portal screen would
 * inherit "Goyal PG — girls' PG in <city>", which is wrong in a browser tab
 * and worse in the installed PWA's task switcher.
 */
const useDocumentTitle = (title) => {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title
    return () => { document.title = previous }
  }, [title])
}

export default useDocumentTitle
