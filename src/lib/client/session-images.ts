let current: { id: string; urls: string[] } | undefined;
export function setSessionImages(id: string, files: File[]) {
  current?.urls.forEach(url => URL.revokeObjectURL(url));
  current = { id, urls: files.map(file => URL.createObjectURL(file)) };
}
export function getSessionImages(id: string): string[] { return current?.id === id ? current.urls : []; }
