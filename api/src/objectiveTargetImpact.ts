export function classifyObjectiveTargetImpact(input: { changedObjectiveId: string; affectedAssets: readonly { id: string; dependsOnObjectiveIds: string[]; published: boolean }[] }): { staleAssetIds: string[]; preservedPublishedAssetIds: string[]; unrelatedAssetIds: string[] } {
  if (!input.changedObjectiveId.trim()) throw new Error("OBJECTIVE_TARGET_ID_REQUIRED");
  const staleAssetIds = input.affectedAssets.filter((asset) => !asset.published && asset.dependsOnObjectiveIds.includes(input.changedObjectiveId)).map((asset) => asset.id);
  const preservedPublishedAssetIds = input.affectedAssets.filter((asset) => asset.published && asset.dependsOnObjectiveIds.includes(input.changedObjectiveId)).map((asset) => asset.id);
  const unrelatedAssetIds = input.affectedAssets.filter((asset) => !asset.dependsOnObjectiveIds.includes(input.changedObjectiveId)).map((asset) => asset.id);
  return { staleAssetIds, preservedPublishedAssetIds, unrelatedAssetIds };
}
