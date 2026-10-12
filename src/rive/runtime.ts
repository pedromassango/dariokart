import RiveCanvas, {
  type RiveCanvas as RiveRuntime,
  type File as RiveFile,
  type WrappedRenderer,
} from '@rive-app/canvas-advanced';
import wasmUrl from '@rive-app/canvas-advanced/rive.wasm?url';

let runtimePromise: Promise<RiveRuntime> | null = null;

/** Loads the Rive WASM runtime once. */
export function loadRive(): Promise<RiveRuntime> {
  if (!runtimePromise) {
    runtimePromise = RiveCanvas({ locateFile: () => wasmUrl });
  }
  return runtimePromise;
}

let filePromise: Promise<RiveFile | null> | null = null;

/** Loads the generated Dariokart .riv asset pack (null if it is missing/invalid). */
export function loadAssetFile(): Promise<RiveFile | null> {
  if (!filePromise) {
    filePromise = (async () => {
      try {
        const rive = await loadRive();
        const res = await fetch(new URL('assets/dariokart.riv', document.baseURI).href);
        if (!res.ok) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        const file = await rive.load(bytes);
        return file ?? null;
      } catch (e) {
        console.warn('[dariokart] could not load .riv assets', e);
        return null;
      }
    })();
  }
  return filePromise;
}

export type { RiveRuntime, RiveFile, WrappedRenderer };
