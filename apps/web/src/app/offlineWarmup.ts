export interface OfflineGroup {
  cacheName: string;
  urls: readonly string[];
}

export async function warmCaches(groups: readonly OfflineGroup[], storage: Pick<CacheStorage, "open">): Promise<void> {
  for (const group of groups) {
    const cache = await storage.open(group.cacheName);
    for (const url of group.urls) {
      if (!(await cache.match(url))) await cache.add(url);
    }
  }
}

export function canWarmNow(connection: { saveData?: boolean } | undefined, isOnline: boolean): boolean {
  return isOnline && connection?.saveData !== true;
}
