/**
 * Whether this account has already been shown the office walkthrough.
 *
 * Kept apart from components/AdminTour.jsx on purpose. Layout has to answer
 * "should I show this?" on every mount, but the walkthrough itself is a modal
 * almost nobody opens — so the check lives here, in the main bundle, and the
 * component is loaded only when it is actually going to be rendered.
 */

// Bump when the app changes enough that the old walkthrough would be describing
// a screen that has moved. Everyone sees the new one once.
const TOUR_VERSION = 1

const seenKey = (userId) => `goyalpg_tour_v${TOUR_VERSION}:${userId}`

export const hasSeenTour = (userId) => {
  if (!userId) return true // no account yet — never pop this over a login screen
  try {
    return localStorage.getItem(seenKey(userId)) === '1'
  } catch {
    return true // storage blocked (private browsing); don't nag on every load
  }
}

export const markTourSeen = (userId) => {
  try { localStorage.setItem(seenKey(userId), '1') } catch { /* ignore */ }
}
