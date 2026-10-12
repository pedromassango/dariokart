import type { RiveTexture } from './riveTexture';

/** Shared Rive-driven textures used inside the 3D world (created by the App once Rive is loaded). */
export interface RiveTextureSet { itemBox: RiveTexture | null; banner: RiveTexture | null; thwomp: RiveTexture | null }
let set: RiveTextureSet = { itemBox: null, banner: null, thwomp: null };
export function setRiveTextures(s: RiveTextureSet) { set = s; }
export function riveTextures(): RiveTextureSet { return set; }
