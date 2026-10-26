import { useState } from 'react';
import { DMG_TYPES } from '../../data/constants';
import { ABILS, type Abil } from '../../data/player';
import type { CharWeapon, Character } from '../../engine/character';
import { validDice } from '../../engine/homebrew';
import { ATTUNE_MAX, attunedCount, isActive, ITEM_PRESETS, itemEffects, itemKey, KIND_LABEL, MOD_LABEL, modText, RARITIES, type ItemKind, type ItemMod, type MagicItem, type ModKey } from '../../engine/magicItems';
import { uid } from '../../engine/util';
import Card, { InfoDialog } from '../../shared/Card';
import Pips from '../../shared/Pips';
import { useStore } from '../../store/useStore';
import { plainText } from './spells';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };
export type SpellOpt = { id: string; n: string; l?: number };
const blank = (): MagicItem => ({ id: 'mi-' + uid(), n: '', kind: 'wondrous', rarity: 'poco común', attune: false, attuned: false, worn: true, d: '', mods: [] });

/** Formulario de un objeto: nombre, texto, sintonización, cargas y los efectos que se aplican solos a la hoja. */
function ItemForm({ item, weapons, spells, onSave, onClose }: { item: MagicItem; weapons: CharWeapon[]; spells: SpellOpt[]; onSave: (i: MagicItem) => void; onClose: () => void }) {
  const [it, setIt] = useState<MagicItem>(item);
  const setMod = (i: number, patch: Partial<ItemMod>) => setIt({ ...it, mods: it.mods.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const addMod = () => setIt({ ...it, mods: [...it.mods, { k: 'ac', v: 1 }] });
  const needAbil = (k: ModKey) => k === 'abilSet' || k === 'abilAdd';
  const badRoll = !!it.roll && !validDice(it.roll);
  const wmod = it.mods.some((m) => m.k === 'wBonus' || m.k === 'wExtra');
  const badExtra = it.mods.some((m) => m.k === 'wExtra' && (!m.dice || !validDice(m.dice)));
  const spellSet = (i: number, patch: Partial<{ id: string; cost: number }>) => setIt({ ...it, spells: (it.spells || []).map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <InfoDialog title={item.n ? 'Editar ' + item.n : 'Objeto mágico'} onClose={onClose}>
      <div className="field"><label htmlFor="mi-n">Nombre</label><input id="mi-n" className="input" value={it.n} onChange={(e) => setIt({ ...it, n: e.target.value })} autoFocus /></div>
      <div className="row2">
        <div className="field"><label htmlFor="mi-k">Tipo</label>
          <select id="mi-k" className="input" value={it.kind} onChange={(e) => setIt({ ...it, kind: e.target.value as ItemKind })}>{(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></div>
        <div className="field"><label htmlFor="mi-r">Rareza</label>
          <select id="mi-r" className="input" value={it.rarity} onChange={(e) => setIt({ ...it, rarity: e.target.value })}>{RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
      </div>
      <label className="check"><input type="checkbox" checked={it.attune} onChange={(e) => setIt({ ...it, attune: e.target.checked, attuned: e.target.checked ? it.attuned : false })} /> Requiere sintonización</label>
      <div className="field"><label htmlFor="mi-d">Texto</label><textarea id="mi-d" className="input" rows={3} value={it.d} onChange={(e) => setIt({ ...it, d: e.target.value })} /></div>
      <fieldset className="fs">
        <legend>Efectos en la hoja</legend>
        <span className="muted small">Se aplican solos mientras el objeto esté puesto (y sintonizado si lo pide).</span>
        {it.mods.map((m, i) => (
          <div key={i} className="row3 hb-fx">
            <div className="field"><label htmlFor={'mi-mk' + i}>Efecto</label>
              <select id={'mi-mk' + i} className="input" value={m.k} onChange={(e) => setMod(i, { k: e.target.value as ModKey, abil: needAbil(e.target.value as ModKey) ? m.abil || 'str' : undefined, type: e.target.value === 'resist' || e.target.value === 'wExtra' ? m.type || 'fuego' : undefined, dice: e.target.value === 'wExtra' ? m.dice || '1d6' : undefined })}>
                {(Object.keys(MOD_LABEL) as ModKey[]).map((k) => <option key={k} value={k}>{MOD_LABEL[k]}</option>)}</select></div>
            {needAbil(m.k) && <div className="field"><label htmlFor={'mi-ma' + i}>Característica</label>
              <select id={'mi-ma' + i} className="input" value={m.abil || 'str'} onChange={(e) => setMod(i, { abil: e.target.value as Abil })}>{ABILS.map((a) => <option key={a} value={a}>{ABIL_N[a]}</option>)}</select></div>}
            {m.k === 'wExtra' && <div className="field"><label htmlFor={'mi-md' + i}>Dados</label>
              <input id={'mi-md' + i} className="input" value={m.dice || ''} placeholder="1d6" aria-invalid={!!m.dice && !validDice(m.dice)} onChange={(e) => setMod(i, { dice: e.target.value })} /></div>}
            {m.k === 'resist' || m.k === 'wExtra'
              ? <div className="field"><label htmlFor={'mi-mt' + i}>Tipo de daño</label>
                <select id={'mi-mt' + i} className="input" value={m.type || 'fuego'} onChange={(e) => setMod(i, { type: e.target.value })}>{DMG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              : <div className="field"><label htmlFor={'mi-mv' + i}>{m.k === 'abilSet' ? 'Valor' : 'Cantidad'}</label>
                <input id={'mi-mv' + i} type="number" className="input" value={m.v ?? ''} onChange={(e) => setMod(i, { v: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })} /></div>}
            {m.k === 'ac' && <label className="check small"><input type="checkbox" checked={m.when === 'noArmor'} onChange={(e) => setMod(i, { when: e.target.checked ? 'noArmor' : undefined })} /> Solo sin armadura ni escudo</label>}
            <button className="btn small ghost" aria-label="Quitar efecto" onClick={() => setIt({ ...it, mods: it.mods.filter((_, j) => j !== i) })}>Quitar</button>
          </div>
        ))}
        <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={addMod}>+ Efecto</button>
        {wmod && <div className="field"><label htmlFor="mi-w">Arma de tu hoja</label>
          <select id="mi-w" className="input" value={it.weapon || ''} onChange={(e) => setIt({ ...it, weapon: e.target.value || undefined })}>
            <option value="">Elige un arma…</option>{weapons.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
          {!weapons.length && <span className="muted small">Añade antes el arma en «Equipo» de la hoja.</span>}</div>}
        {badExtra && <span className="warn small">El daño adicional necesita dados (1d6).</span>}
      </fieldset>
      <fieldset className="fs">
        <legend>Cargas o usos</legend>
        <div className="row3">
          <div className="field"><label htmlFor="mi-cm">Cargas</label>
            <input id="mi-cm" type="number" min={0} className="input" value={it.charges?.max ?? ''} placeholder="sin cargas" onChange={(e) => { const n = parseInt(e.target.value, 10); setIt({ ...it, charges: n > 0 ? { max: n, per: it.charges?.per ?? 'lr' } : undefined }); }} /></div>
          {it.charges && <div className="field"><label htmlFor="mi-cp">Se recuperan</label>
            <select id="mi-cp" className="input" value={it.charges.per} onChange={(e) => setIt({ ...it, charges: { max: it.charges!.max, per: e.target.value as 'lr' | 'sr' | '' } })}>
              <option value="lr">En descanso largo (al amanecer)</option><option value="sr">En descanso corto</option><option value="">No se recuperan</option></select></div>}
          {it.charges && <div className="field"><label htmlFor="mi-ro">Tirada al usarlo</label>
            <input id="mi-ro" className="input" value={it.roll || ''} placeholder="2d4+2" aria-invalid={badRoll} onChange={(e) => setIt({ ...it, roll: e.target.value })} /></div>}
        </div>
        {badRoll && <span className="warn small">Escribe dados como 2d4+2.</span>}
        {it.charges && <>
          <span className="muted small">Conjuros que lanza el objeto con sus cargas.</span>
          {(it.spells || []).map((s, i) => (
            <div key={i} className="row3">
              <div className="field"><label htmlFor={'mi-sp' + i}>Conjuro</label>
                <select id={'mi-sp' + i} className="input" value={s.id} onChange={(e) => spellSet(i, { id: e.target.value })}>
                  <option value="">Elige…</option>{spells.map((x) => <option key={x.id} value={x.id}>{x.n}</option>)}</select></div>
              <div className="field"><label htmlFor={'mi-sc' + i}>Cargas por lanzamiento</label>
                <input id={'mi-sc' + i} type="number" min={1} className="input" value={s.cost} onChange={(e) => spellSet(i, { cost: Math.max(1, parseInt(e.target.value, 10) || 1) })} /></div>
              <button className="btn small ghost" aria-label="Quitar conjuro" onClick={() => setIt({ ...it, spells: (it.spells || []).filter((_, j) => j !== i) })}>Quitar</button>
            </div>
          ))}
          <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setIt({ ...it, spells: [...(it.spells || []), { id: '', cost: 1 }] })}>+ Conjuro</button>
        </>}
      </fieldset>
      <div className="rollrow">
        <button className="btn small primary" disabled={!it.n.trim() || badRoll || badExtra} onClick={() => onSave({ ...it, n: it.n.trim(), roll: it.charges && it.roll?.trim() ? it.roll.trim() : undefined, spells: it.charges && it.spells?.some((s) => s.id) ? it.spells.filter((s) => s.id) : undefined, weapon: wmod ? it.weapon : undefined })}>Guardar</button>
        <button className="btn small ghost" onClick={onClose}>Cancelar</button>
      </div>
    </InfoDialog>
  );
}

/** Objetos mágicos del personaje: puestos y sintonizados cambian solos la CA, las salvaciones, las características y demás. */
export default function MagicItemsPanel({ c, set, spells }: { c: Character; set: (patch: Partial<Character>) => void; spells: SpellOpt[] }) {
  const items = c.magicItems || [];
  const [form, setForm] = useState<MagicItem | null>(null);
  const [preset, setPreset] = useState('');
  const who = c.name || 'Personaje';
  const att = attunedCount(items);
  const save = (list: MagicItem[]) => set({ magicItems: list });
  const upd = (id: string, patch: Partial<MagicItem>) => save(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const ifx = itemEffects(items);
  // con la CA o los PG fijados a mano (hoja importada), los objetos no los cambian
  const fixed = [(ifx.ac && c.ov.ac != null) && 'la CA', (ifx.hp && c.ov.hpMax != null) && 'los PG máximos', (ifx.init && c.ov.init != null) && 'la iniciativa', (ifx.speed && c.ov.speed != null) && 'la velocidad'].filter(Boolean) as string[];
  const useCharge = (i: MagicItem) => {
    const used = c.uses[itemKey(i)] || 0;
    set({ uses: { ...c.uses, [itemKey(i)]: used + 1 } });
    if (i.roll) useStore.getState().roll({ label: who + ' · ' + i.n, kind: 'free', who, parts: [{ expr: i.roll }] });
  };
  return (
    <section className="panel" aria-label="Objetos mágicos" data-sec="rasgos">
      <div className="panel-head">
        <h3 className="eyebrow">Objetos mágicos</h3>
        <span className={att > ATTUNE_MAX ? 'chip-tag warn' : 'chip-tag'} title="Un personaje solo puede estar sintonizado con tres objetos a la vez">Sintonía {att}/{ATTUNE_MAX}</span>
      </div>
      <div className="rollrow">
        <select className="input" style={{ maxWidth: 260 }} aria-label="Objeto de ejemplo" value={preset} onChange={(e) => { setPreset(''); const p = ITEM_PRESETS[Number(e.target.value)]; if (p) setForm({ ...blank(), ...p, mods: p.mods.map((m) => ({ ...m })) }); }}>
          <option value="">Ejemplos…</option>
          {ITEM_PRESETS.map((p, i) => <option key={p.n} value={i}>{p.n}</option>)}
        </select>
        <button className="btn small" onClick={() => setForm(blank())}>+ Objeto</button>
      </div>
      {fixed.length > 0 && <p className="warn small" role="status" style={{ margin: 0 }}>Tienes {fixed.join(', ')} fijado(s) a mano en «Editar hoja»: los objetos no lo cambian. Quita el valor fijado para que se sume solo.</p>}
      {att > ATTUNE_MAX && <p className="warn small" role="status" style={{ margin: 0 }}>Estás sintonizado con más de tres objetos: las reglas no lo permiten.</p>}
      {items.length === 0 && <p className="muted small" style={{ margin: 0 }}>Añade un objeto a mano o parte de un ejemplo: sus efectos (CA, salvaciones, características…) se suman solos mientras esté puesto y sintonizado.</p>}
      <ul className="pc-features grid acts">
        {items.map((i) => {
          const used = i.charges ? Math.min(i.charges.max, c.uses[itemKey(i)] || 0) : 0;
          const on = isActive(i);
          return (
            <li key={i.id}>
              <Card name={i.n} head={<>
                <span className="muted small">{KIND_LABEL[i.kind]} · {i.rarity}{i.attune ? ' · sintonía' : ''}</span>
                {i.mods.length > 0 && <span className="chip-tag" style={on ? undefined : { opacity: 0.55 }}>{i.mods.map(modText).join(' · ')}</span>}
                <span className="rollrow">
                  <label className="check small"><input type="checkbox" checked={i.worn} aria-label={'Puesto: ' + i.n} onChange={(e) => upd(i.id, { worn: e.target.checked })} /> Puesto</label>
                  {i.attune && <label className="check small"><input type="checkbox" checked={i.attuned} disabled={!i.attuned && att >= ATTUNE_MAX} aria-label={'Sintonizado: ' + i.n} onChange={(e) => upd(i.id, { attuned: e.target.checked })} /> Sintonizado</label>}
                </span>
                {i.charges && (
                  <span className="rollrow">
                    <Pips max={i.charges.max} used={used} label={'Cargas de ' + i.n} onSet={(v) => set({ uses: { ...c.uses, [itemKey(i)]: Math.max(0, Math.min(i.charges!.max, v)) } })} />
                    <button className="btn small" disabled={used >= i.charges.max} onClick={() => useCharge(i)}>{i.roll ? 'Usar: tirar ' + i.roll : 'Usar (gasta una carga)'}</button>
                  </span>
                )}
                <span className="rollrow">
                  <button className="btn small ghost" onClick={() => setForm(i)}>Editar</button>
                  <button className="btn small ghost" onClick={() => save(items.filter((x) => x.id !== i.id))}>Quitar</button>
                </span>
              </>}>
                {i.d && <p className="pc-text">{plainText(i.d)}</p>}
                {i.charges && <p className="muted small">{i.charges.per === 'lr' ? 'Se recuperan en descanso largo.' : i.charges.per === 'sr' ? 'Se recuperan en descanso corto.' : 'No se recuperan.'}</p>}
              </Card>
            </li>
          );
        })}
      </ul>
      {form && <ItemForm item={form} weapons={c.weapons} spells={spells} onClose={() => setForm(null)} onSave={(it) => { save(items.some((x) => x.id === it.id) ? items.map((x) => (x.id === it.id ? it : x)) : [...items, it]); setForm(null); }} />}
    </section>
  );
}
