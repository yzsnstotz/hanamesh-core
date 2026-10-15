// C-POINTS OwnPointsDTO zero-balance examples, inlined from @hanamesh/api-contracts v0.10.0
// `createPointsContractExamples()` (unboundZero / boundZero) so tests read no contract package.
export const unboundZero = Object.freeze({
  bindingStatus: 'UNBOUND', hanas: [], totalPoints: 0,
  subtotals: {userPoints: 0, pendingUserPoints: 0, creatorReward: 0, unclassified: 0},
});
export const boundZero = Object.freeze({
  bindingStatus: 'BOUND', hanas: [], totalPoints: 0,
  subtotals: {userPoints: 0, pendingUserPoints: 0, creatorReward: 0, unclassified: 0},
});
