export const unknownCatalogDetailSignals = Object.freeze({
  stars: null,
  npmDownloads30d: null,
  storeInstalls30d: null,
  checkedAt: null,
  unknownReasons: Object.freeze({
    stars: 'not_observed',
    npmDownloads30d: 'not_observed',
    storeInstalls30d: 'history_unavailable',
    checkedAt: 'not_observed',
  }),
});

export function catalogPage(cards, {
  pageNumber = 1, total = cards.length, nextCursor = null,
  facets = {}, searchMode = 'keyword', semanticNotice = null, paginationReset = false,
} = {}) {
  return {
    kind: 'page', pageNumber, limit: 50, cards,
    searchId: null, semanticNotice, paginationReset, popularityAsOf: null,
    page: {
      items: cards.map((card, index) => ({
        hanaId: card.hanaId, rank: (pageNumber - 1) * 50 + index + 1,
        tier: 1, authority: 0, authorityVersion: null, stars: null,
        npmDownloads30d: null, updatedAt: '2026-11-27T00:00:00Z',
        ...(searchMode === 'hybrid' ? {matchKind: 'meaning'} : {}),
      })),
      total, capped: false, hiddenInsufficientCount: 0, hiddenInsufficientCountCapped: false,
      facets: {categories: [], channels: [], sources: [], domains: [], subdivisions: [], ...facets},
      nextCursor, snapshot: 'fixture', policyVersion: 1, searchMode, indexReady: true,
    },
  };
}
