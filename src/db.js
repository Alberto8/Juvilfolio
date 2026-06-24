import { supabase } from './supabase'

// ── ASSETS ──
export async function fetchAssets() {
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .order('platform')
    .order('category')
    .order('name')
  if (error) throw error
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

export async function bulkUpdateAssetValues(updates) {
  // updates = [{ id, valorActual }]
  const promises = updates.map(u =>
    supabase.from('assets').update({ valor_actual: u.valorActual }).eq('id', u.id)
  )
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
    cartera_msci_em: entry.carteraME,
    cartera_clase_c: entry.carteraC,
  }

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
