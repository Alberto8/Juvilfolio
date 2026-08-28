import { supabase } from './supabase'

// ¿Existe la columna 'manual' en assets? Se deduce de la primera fila leída.
// Sin esta comprobación, escribir 'manual' en una base que no ha pasado la
// migración hace fallar TODOS los guardados de activos.
let hasManual = false
let hasPlan = false
export function manualSupported() { return hasManual }
export function planSupported() { return hasPlan }

// ── ASSETS ──
export async function fetchAssets() {
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .order('platform')
    .order('category')
    .order('name')
  if (error) throw error
  if (data && data.length) {
    hasManual = 'manual' in data[0]
    hasPlan = 'plan_mensual' in data[0]
  }
  return (data || []).map(r => ({
    id: r.id,
    name: r.name,
    ticker: r.ticker,
    platform: r.platform,
    type: r.type,
    category: r.category,
    participaciones: parseFloat(r.participaciones),
    costeMedio: parseFloat(r.coste_medio),
    aportado: parseFloat(r.aportado),
    valorActual: parseFloat(r.valor_actual),
    gananciaEur: parseFloat(r.ganancia_eur),
    gananciaPct: parseFloat(r.ganancia_pct),
    manual: !!r.manual,
    planMensual: !!r.plan_mensual,
  }))
}

export async function upsertAsset(asset) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No hay sesión activa')

  const row = {
    user_id: user.id,
    name: asset.name,
    ticker: asset.ticker,
    platform: asset.platform,
    type: asset.type,
    category: asset.category,
    participaciones: asset.participaciones,
    coste_medio: asset.costeMedio,
    aportado: asset.aportado,
    valor_actual: asset.valorActual,
  }
  // Solo se envían si las columnas existen, para no romper el guardado
  if (hasManual) row.manual = !!asset.manual
  if (hasPlan) row.plan_mensual = !!asset.planMensual

  const isExisting = asset.id && !asset.id.startsWith('temp-')

  if (isExisting) {
    // UPDATE de activo existente
    const { data, error } = await supabase
      .from('assets')
      .update(row)
      .eq('id', asset.id)
      .select()
    if (error) throw error
    return data
  } else {
    // INSERT de activo nuevo (sin pasar id, lo genera la BD)
    const { data, error } = await supabase
      .from('assets')
      .insert(row)
      .select()
    if (error) throw error
    return data
  }
}

export async function deleteAsset(id) {
  const { error } = await supabase.from('assets').delete().eq('id', id)
  if (error) throw error
}

export async function setAssetManual(id, manual) {
  if (!hasManual) throw new Error('Falta la columna "manual" en la tabla assets. Ejecuta migracion-valores-manuales.sql en Supabase.')
  const { error } = await supabase.from('assets').update({ manual }).eq('id', id)
  if (error) throw error
}

export async function bulkUpdateAssetValues(updates) {
  // updates = [{ id, valorActual, participaciones? }]
  const promises = updates.map(u => {
    const row = { valor_actual: u.valorActual }
    if (u.participaciones != null) row.participaciones = u.participaciones
    return supabase.from('assets').update(row).eq('id', u.id)
  })
  await Promise.all(promises)
}

// ── FUND MONTHLY ──
export async function fetchFundMonthly() {
  const { data, error } = await supabase
    .from('fund_monthly')
    .select('*')
    .order('month')
  if (error) throw error
  return (data || []).map(r => ({
    id: r.id,
    month: r.month,
    apMsci: parseFloat(r.ap_msci),
    apEm: parseFloat(r.ap_emergentes),
    apClaseC: parseFloat(r.ap_clase_c),
    carteraMsci: parseFloat(r.cartera_msci ?? 0),
    carteraEm: parseFloat(r.cartera_emergentes ?? 0),
    carteraME: parseFloat(r.cartera_msci_em),
    carteraC: parseFloat(r.cartera_clase_c),
  }))
}

export async function upsertFundMonth(entry) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No hay sesión activa')

  const row = {
    user_id: user.id,
    month: entry.month,
    ap_msci: entry.apMsci,
    ap_emergentes: entry.apEm,
    ap_clase_c: entry.apClaseC,
  }
  // Los valores de cartera los calcula la app con el NAV de Yahoo, así que solo
  // se escriben cuando se pasan explícitamente (bulkUpdateFundValues)
  if (entry.carteraMsci != null) row.cartera_msci = entry.carteraMsci
  if (entry.carteraEm != null) row.cartera_emergentes = entry.carteraEm
  if (entry.carteraME != null) row.cartera_msci_em = entry.carteraME
  if (entry.carteraC != null) row.cartera_clase_c = entry.carteraC

  // Comprobar si ya existe una fila para este mes y usuario
  const { data: existing, error: selErr } = await supabase
    .from('fund_monthly')
    .select('id')
    .eq('user_id', user.id)
    .eq('month', entry.month)
    .maybeSingle()
  if (selErr) throw selErr

  if (existing) {
    // UPDATE de la fila existente
    const { data, error } = await supabase
      .from('fund_monthly')
      .update(row)
      .eq('id', existing.id)
      .select()
    if (error) throw error
    return data
  } else {
    // INSERT de fila nueva
    const { data, error } = await supabase
      .from('fund_monthly')
      .insert(row)
      .select()
    if (error) throw error
    return data
  }
}

export async function deleteFundMonth(id) {
  const { error } = await supabase.from('fund_monthly').delete().eq('id', id)
  if (error) throw error
}

// ── SNAPSHOTS ──
// Foto diaria de toda la cartera. Igual que con 'manual', se detecta si la
// tabla existe para que una migración pendiente no rompa nada.
let hasSnaps = false
export function snapshotsSupported() { return hasSnaps }

export async function fetchSnapshots() {
  const { data, error } = await supabase
    .from('asset_snapshots')
    .select('*')
    .order('taken_on')
  if (error) {
    hasSnaps = false
    console.warn('asset_snapshots no disponible (¿falta migracion-historico.sql?):', error.message)
    return []
  }
  hasSnaps = true
  return (data || []).map(r => ({
    assetId: r.asset_id,
    takenOn: r.taken_on,
    participaciones: parseFloat(r.participaciones),
    aportado: parseFloat(r.aportado),
    valorActual: parseFloat(r.valor_actual),
    precio: r.precio == null ? null : parseFloat(r.precio),
  }))
}

export async function saveSnapshots(assets) {
  if (!hasSnaps || !assets.length) return 0
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No hay sesión activa')
  const today = new Date().toISOString().slice(0, 10)
  const rows = assets.map(a => ({
    user_id: user.id,
    asset_id: a.id,
    taken_on: today,
    participaciones: a.participaciones,
    aportado: a.aportado,
    valor_actual: a.valorActual,
    precio: a.participaciones > 0 ? Math.round((a.valorActual / a.participaciones) * 1e6) / 1e6 : null,
  }))
  const { error } = await supabase
    .from('asset_snapshots')
    .upsert(rows, { onConflict: 'user_id,asset_id,taken_on' })
  if (error) throw error
  return rows.length
}

export async function bulkUpdateFundValues(rows) {
  // rows = [{ id, carteraMsci, carteraEm, carteraME, carteraC }]
  const promises = rows.map(r =>
    supabase.from('fund_monthly').update({
      cartera_msci: r.carteraMsci,
      cartera_emergentes: r.carteraEm,
      cartera_msci_em: r.carteraME,
      cartera_clase_c: r.carteraC,
    }).eq('id', r.id)
  )
  const res = await Promise.all(promises)
  const err = res.find(r => r.error)
  if (err) throw err.error
}

// ── VALOR LIQUIDATIVO MENSUAL (Yahoo) ──
// Serie mensual de cada fondo del plan, para calcular participaciones compradas
// y valor de cartera sin que haya que teclearlos.
export async function fetchNavSeries(items) {
  const r = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, range: '5y' }),
  })
  if (!r.ok) throw new Error('El servidor devolvió ' + r.status)
  const data = await r.json()
  const out = {}
  for (const [k, v] of Object.entries(data?.series || {})) {
    if (v && v.months && Object.keys(v.months).length) out[k] = v
  }
  return Object.keys(out).length ? out : null
}

// ── APORTACIONES MENSUALES (una fila por activo y mes) ──
// Sustituye a fund_monthly, que tenía una columna fija por fondo y no permitía
// añadir activos ni distinguir el mismo fondo en dos plataformas.
let hasContrib = false
export function contribSupported() { return hasContrib }

export async function fetchContributions() {
  const { data, error } = await supabase
    .from('fund_contributions')
    .select('*')
    .order('month')
  if (error) {
    hasContrib = false
    console.warn('fund_contributions no disponible (¿falta migracion-plan-mensual.sql?):', error.message)
    return []
  }
  hasContrib = true
  return (data || []).map(r => ({
    id: r.id,
    assetId: r.asset_id,
    month: r.month,
    aportado: parseFloat(r.aportado),
  }))
}

// Guarda las aportaciones de un mes. Las que llegan a 0 se borran, para no
// dejar filas vacías que ensucien la tabla.
export async function saveMonthContributions(month, porActivo) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No hay sesión activa')

  const conAporte = Object.entries(porActivo).filter(([, v]) => v > 0)
  const aCero = Object.entries(porActivo).filter(([, v]) => !(v > 0)).map(([id]) => id)

  if (conAporte.length) {
    const rows = conAporte.map(([assetId, aportado]) => ({ user_id: user.id, asset_id: assetId, month, aportado }))
    const { error } = await supabase
      .from('fund_contributions')
      .upsert(rows, { onConflict: 'user_id,asset_id,month' })
    if (error) throw error
  }
  if (aCero.length) {
    const { error } = await supabase
      .from('fund_contributions')
      .delete()
      .eq('user_id', user.id)
      .eq('month', month)
      .in('asset_id', aCero)
    if (error) throw error
  }
}

export async function deleteMonthContributions(month) {
  const { error } = await supabase.from('fund_contributions').delete().eq('month', month)
  if (error) throw error
}
