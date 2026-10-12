// Art definitions for public/assets/dariokart.riv
import { RivFile } from './riv-writer.mjs';
import { buildLogo } from './art/logo.mjs';
import { buildItems, buildItemBox } from './art/items.mjs';
import { buildPortraits } from './art/characters.mjs';
import { buildKarts } from './art/karts.mjs';
import { buildReferee } from './art/referee.mjs';
import { buildTrophy } from './art/trophy.mjs';
import { buildProps } from './art/props.mjs';
import { buildGlyphs, buildPlaces, buildItemSlot, buildLap, buildBanner } from './art/hud.mjs';
import { CHAR_IDS } from './contract.mjs';

export function buildAssets({ only } = {}) {
  const file = new RivFile();
  const want = (n) => !only || only.some((o) => n.startsWith(o) || o.startsWith(n));
  if (want('Logo')) buildLogo(file);
  if (want('Referee')) buildReferee(file);
  if (want('Portrait_')) buildPortraits(file, CHAR_IDS);
  if (want('Kart_')) buildKarts(file, CHAR_IDS);
  if (want('Item_')) buildItems(file);
  if (want('ItemBox')) buildItemBox(file);
  if (want('Trophy')) buildTrophy(file);
  if (['ItemPanel', 'Pipe', 'Thwomp', 'Tree', 'Bush', 'Palm', 'DeadTree', 'Mole'].some(want)) buildProps(file);
  if (want('Glyph_')) file.glyphWidths = buildGlyphs(file);
  if (want('Place_')) buildPlaces(file);
  if (want('ItemSlot')) buildItemSlot(file);
  if (want('Lap')) buildLap(file);
  if (want('Banner')) buildBanner(file);
  return file;
}
