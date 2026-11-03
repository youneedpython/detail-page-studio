export type Photo = { index: number; blob: Blob; description: string };
export interface PhotoStore {
  readonly persistent: boolean;
  save(draftId: string, photos: Photo[]): Promise<void>;
  list(draftId: string): Promise<Photo[]>;
  remove(draftId: string): Promise<void>;
}
export class MemoryPhotoStore implements PhotoStore {
  readonly persistent = false;
  private entries = new Map<string, Photo[]>();
  async save(draftId: string, photos: Photo[]) { this.entries.set(draftId, photos.map(photo => ({ ...photo }))); }
  async list(draftId: string) { return (this.entries.get(draftId) ?? []).map(photo => ({ ...photo })); }
  async remove(draftId: string) { this.entries.delete(draftId); }
}
type RecordPhoto = Photo & { id: string; draftId: string };
export class IndexedDBPhotoStore implements PhotoStore {
  readonly persistent = true;
  constructor(private db: IDBDatabase) {}
  private async records(draftId: string): Promise<RecordPhoto[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("photos", "readonly");
      const request = tx.objectStore("photos").getAll();
      request.onsuccess = () => resolve((request.result as RecordPhoto[]).filter(photo => photo.draftId === draftId));
      request.onerror = () => reject(request.error);
    });
  }
  async list(draftId: string) { return (await this.records(draftId)).sort((a, b) => a.index - b.index).map(({ index, blob, description }) => ({ index, blob, description })); }
  async save(draftId: string, photos: Photo[]) {
    const previous = await this.records(draftId);
    await new Promise<void>((resolve, reject) => {
      const tx = this.db.transaction("photos", "readwrite");
      const store = tx.objectStore("photos");
      previous.forEach(photo => store.delete(photo.id));
      photos.forEach(photo => store.put({ ...photo, draftId, id: `${draftId}:${photo.index}` }));
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  }
  async remove(draftId: string) { await this.save(draftId, []); }
}
const memory = new MemoryPhotoStore();
let cached: Promise<PhotoStore> | undefined;
export function getPhotoStore(): Promise<PhotoStore> {
  cached ??= new Promise<PhotoStore>(resolve => {
    try {
      const request = indexedDB.open("dps", 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("photos")) request.result.createObjectStore("photos", { keyPath: "id" }); };
      request.onsuccess = () => resolve(new IndexedDBPhotoStore(request.result));
      request.onerror = () => resolve(memory); request.onblocked = () => resolve(memory);
    } catch { resolve(memory); }
  });
  return cached;
}
// Also fall back when IndexedDB opens successfully but a write fails (quota/private mode).
export async function storePhotos(draftId: string, photos: Photo[]): Promise<PhotoStore> {
  const store = await getPhotoStore();
  try { await store.save(draftId, photos); return store; }
  catch { await memory.save(draftId, photos); cached = Promise.resolve(memory); return memory; }
}
